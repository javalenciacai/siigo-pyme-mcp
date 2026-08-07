/**
 * Ejecucion de `EXCELSIIGO.exe`.
 *
 * Tres reglas nacen de como esta construido el binario y no se pueden relajar:
 *
 * 1. Es un ejecutable de subsistema GUI: no escribe a stdout. Se invoca con `stdio: 'ignore'`
 *    y el resultado se lee del archivo `NombreLog` que el propio ejecutable genera.
 *    Redirigir la salida a esa misma ruta la sobreescribe con el banner de la consola y
 *    destruye la unica evidencia de lo que paso.
 * 2. Termina con codigo 0 aunque falle (por ejemplo con `081`), asi que el veredicto
 *    combina codigo de salida, contenido del log y existencia del archivo generado.
 * 3. No tolera ejecuciones simultaneas: todas las corridas pasan por una cola serial.
 * 4. Ante un error NO termina: abre un cuadro de dialogo modal ("SIIGO ha encontrado la
 *    siguiente inconsistencia") y espera indefinidamente a que alguien pulse Aceptar, sin
 *    escribir el log. Un servidor desatendido se quedaria colgado hasta el timeout, con la
 *    cola bloqueada y una ventana huerfana en el escritorio del usuario. Por eso se vigila
 *    el titulo de la ventana del proceso y se aborta en cuanto aparece un dialogo de error,
 *    reportando ese titulo, que es el unico sitio donde SIIGO dice que fue mal.
 *
 * Ademas exige Microsoft Excel instalado y una sesion de escritorio interactiva, porque
 * delega la generacion del `.xlsx` a `SiigoExcel.exe`, que usa Excel por COM.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { FunctionSpec } from '../catalog/types.js';
import { buildArgv, MAX_PATH_ARG, redactedCommandLine, SiigoArgError, type CommonArgs } from './args.js';
import { readSiigoExcelResult, readSiigoLog, type ParsedLog } from './logparse.js';

export interface RunRequest {
  fn: FunctionSpec;
  exePath: string;
  installationDir: string;
  companyPath: string;
  year: string;
  norma: string;
  user: string;
  password: string;
  /** Valores de los parametros de la funcion, por nombre camelCase. */
  params: Record<string, unknown>;
  /** Carpeta donde dejar los `.xlsx` generados y los logs de error. */
  outputDir: string;
  timeoutMs: number;
  /**
   * Se invoca periodicamente mientras el ejecutable trabaja. Sirve para emitir progreso
   * al cliente MCP: sin senales de vida, un cliente con el timeout por defecto de 60 s
   * aborta cualquier exportacion grande aunque el servidor siga esperando.
   */
  onProgress?: (elapsedMs: number) => void;
}

export interface RunResult {
  ok: boolean;
  /** Motivos por los que la corrida se considera fallida. Vacio si `ok`. */
  problems: string[];
  exitCode: number | null;
  timedOut: boolean;
  /** Titulo del cuadro de dialogo que bloqueo la ejecucion, si aparecio uno. */
  dialogTitle: string | null;
  /**
   * La empresa no tiene el modulo que necesita esta funcion (seriales, nomina...).
   * La corrida no es correcta, pero tampoco tiene arreglo: reintentar no sirve de nada.
   */
  moduleUnavailable: boolean;
  durationMs: number;
  /** Linea de comando ejecutada, con la clave enmascarada. */
  commandLine: string;
  logPath: string;
  log: ParsedLog;
  /** Ruta del `.xlsx` generado, cuando la funcion produce uno. */
  outputPath: string | null;
  outputBytes: number | null;
  /** Ruta del log de errores de una importacion, cuando aplica. */
  errorLogPath: string | null;
  /** Resultado JSON de `SiigoExcel.exe`, si dejo uno para esta corrida. */
  excelResult: { success: boolean; resultMessage: string } | null;
  /** Valores finales de cada parametro. */
  resolvedParams: Record<string, string>;
}

/**
 * Cola serial. Todas las corridas se encadenan sobre esta promesa, incluso las que fallan,
 * de modo que un error no deja la cola trabada.
 */
const execFileAsync = promisify(execFile);

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}

let counter = Math.floor(Math.random() * 1296);

/** Identificador corto (4 caracteres) para mantener las rutas por debajo de 50 caracteres. */
function nextRunId(): string {
  counter = (counter + 1) % 1_679_616;
  return counter.toString(36).padStart(4, '0');
}

/** Mata el proceso y sus hijos: `EXCELSIIGO.exe` lanza `SiigoExcel.exe`, que a su vez abre Excel. */
function killTree(pid: number): void {
  execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {
    // Si el proceso ya murio, taskkill falla; no hay nada que hacer.
  });
}

async function fileSize(p: string): Promise<number | null> {
  try {
    return (await stat(p)).size;
  } catch {
    return null;
  }
}

/**
 * Crea una carpeta si falta.
 *
 * No se usa `mkdir(recursive)` a secas porque en unidades de red mapeadas (las empresas
 * suelen vivir en una `Z:` apuntando a un UNC) Node intenta crear tambien la raiz de la
 * unidad y falla con `UNKNOWN`, aunque la carpeta ya exista.
 */
async function ensureDir(dir: string): Promise<void> {
  if (existsSync(dir)) return;
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    if (!existsSync(dir)) {
      throw new Error(`No se pudo crear la carpeta "${dir}": ${(err as Error).message}`);
    }
  }
}

/**
 * Comprueba que la carpeta de la empresa se pueda alcanzar antes de invocar el ejecutable.
 *
 * Las empresas suelen vivir en una unidad de red mapeada. Cuando el recurso compartido se
 * cae, Windows deja el mapeo visible en `net use` pero marcado como desconectado, y
 * cualquier acceso falla con `UNKNOWN` en vez de `ENOENT`. Sin este control, SIIGO se
 * ejecutaria igual y devolveria un log vacio imposible de interpretar.
 */
async function assertCompanyReachable(companyPath: string): Promise<void> {
  if (existsSync(companyPath)) return;

  const drive = companyPath.slice(0, 2);
  let detalle = '';
  try {
    const { stdout } = await execFileAsync('net', ['use', drive], { windowsHide: true });
    detalle = ` Estado del mapeo segun "net use ${drive}":\n${stdout.trim()}`;
  } catch (err) {
    const output = (err as { stdout?: string; stderr?: string });
    const texto = (output.stdout ?? output.stderr ?? '').trim();
    if (texto) detalle = ` Salida de "net use ${drive}":\n${texto}`;
  }

  throw new Error(
    `No se puede acceder a la carpeta de la empresa "${companyPath}". `
    + `Si ${drive} es una unidad de red, es probable que este mapeada pero desconectada: vuelva a conectarla `
    + `(por ejemplo abriendola en el Explorador o con "net use ${drive} \\\\servidor\\recurso") y reintente.${detalle}`,
  );
}

/** Borra un archivo previo para que su existencia posterior sea prueba de que esta corrida lo genero. */
async function clearStale(p: string | null): Promise<void> {
  if (!p) return;
  await rm(p, { force: true }).catch(() => undefined);
}

interface ResolvedPaths {
  logPath: string;
  outputPath: string | null;
  errorLogPath: string | null;
  params: Record<string, unknown>;
}

/**
 * Completa las rutas que el llamador no aporto.
 *
 * El log va a `<empresa>\LOGS\` y los `.xlsx` a la carpeta de salida configurada. Ambos
 * nombres se mantienen cortos a proposito: el manual limita estos argumentos a 50
 * caracteres y el ejecutable no avisa cuando se pasa, simplemente no genera nada.
 */
function resolvePaths(req: RunRequest): ResolvedPaths {
  const runId = nextRunId();
  const params = { ...req.params };

  const logPath = path.join(req.companyPath, 'LOGS', `mcp${runId}.log`);

  let outputPath: string | null = null;
  let errorLogPath: string | null = null;

  for (const p of req.fn.params) {
    const given = params[p.name];
    const hasValue = given !== undefined && given !== null && String(given).trim() !== '';

    if (p.type.kind === 'outfile') {
      outputPath = hasValue ? String(given).trim() : path.join(req.outputDir, `${req.fn.name}-${runId}.xlsx`);
      params[p.name] = outputPath;
    } else if (p.type.kind === 'errlog') {
      errorLogPath = hasValue ? String(given).trim() : path.join(req.outputDir, `${req.fn.name}-${runId}-err.xlsx`);
      params[p.name] = errorLogPath;
    }
  }

  if (logPath.length > MAX_PATH_ARG) {
    throw new SiigoArgError(
      'logPath',
      `La ruta del log "${logPath}" supera los ${MAX_PATH_ARG} caracteres que admite el CLI.`,
    );
  }

  return { logPath, outputPath, errorLogPath, params };
}

export async function runFunction(req: RunRequest): Promise<RunResult> {
  return enqueue(() => runFunctionUnqueued(req));
}

async function runFunctionUnqueued(req: RunRequest): Promise<RunResult> {
  const { logPath, outputPath, errorLogPath, params } = resolvePaths(req);

  const common: CommonArgs = {
    companyPath: req.companyPath,
    year: req.year,
    norma: req.norma,
    user: req.user,
    password: req.password,
    logPath,
  };

  const { argv, resolved } = buildArgv(req.fn, common, params);
  const commandLine = redactedCommandLine(req.exePath, argv);

  await assertCompanyReachable(req.companyPath);

  // El ejecutable no crea carpetas: si el destino no existe, no escribe nada y no avisa.
  await ensureDir(path.dirname(logPath));
  if (outputPath) await ensureDir(path.dirname(outputPath));
  if (errorLogPath) await ensureDir(path.dirname(errorLogPath));

  // Verificar las entradas antes de invocar da un error claro en vez de un log cifrado.
  for (const p of req.fn.params) {
    if (p.type.kind !== 'infile') continue;
    const value = resolved[p.name]!;
    if (!existsSync(value)) {
      throw new SiigoArgError(p.name, `${p.cli}: el archivo "${value}" no existe.`);
    }
  }

  await clearStale(logPath);
  await clearStale(outputPath);

  const startedAt = Date.now();
  const { exitCode, timedOut, dialogTitle } = await spawnAndWait(
    req.exePath,
    argv,
    req.installationDir,
    req.timeoutMs,
    req.onProgress,
  );
  const durationMs = Date.now() - startedAt;

  const log = await readSiigoLog(logPath);
  const outputBytes = outputPath ? await fileSize(outputPath) : null;
  const excelResult = await readSiigoExcelResult(req.installationDir, startedAt);

  const problems: string[] = [];

  if (dialogTitle) {
    problems.push(
      `SIIGO abrio un cuadro de dialogo y se quedo esperando a que alguien lo cerrara: "${dialogTitle}". `
      + 'Se cancelo la ejecucion. Ese titulo es el mensaje de error de SIIGO; la causa mas frecuente es '
      + 'usuario o clave incorrectos, un anio de proceso que la empresa no tiene abierto, o parametros '
      + 'fuera de rango. Cuando esto ocurre el ejecutable no escribe el log.',
    );
  }

  if (timedOut) problems.push(`La ejecucion supero el limite de ${Math.round(req.timeoutMs / 1000)} s y fue cancelada.`);
  // Tras matar el proceso el codigo de salida es ruido, no informacion.
  if (exitCode !== 0 && exitCode !== null && !dialogTitle && !timedOut) {
    problems.push(`El ejecutable termino con codigo ${exitCode}.`);
  }
  problems.push(...log.errors);
  if (excelResult && !excelResult.success) problems.push(`SiigoExcel: ${excelResult.resultMessage}`);

  // Con un dialogo o un modulo ausente ya se sabe la causa; enumerar consecuencias la tapa.
  if (req.fn.kind === 'export' && !dialogTitle && !log.moduleUnavailable) {
    if (outputBytes === null) {
      // Si el log ya explica que fallo, apuntar a Excel confundiria: el archivo falta como
      // consecuencia de ese error, no por un problema de instalacion.
      problems.push(
        log.errors.length > 0
          ? `Ademas, no se genero el archivo "${outputPath}".`
          : `No se genero el archivo "${outputPath}". Revise que Microsoft Excel este instalado y que haya una sesion de escritorio activa: `
            + 'EXCELSIIGO.exe delega la generacion del xlsx a SiigoExcel.exe, que usa Excel por COM.',
      );
    } else if (outputBytes === 0) {
      problems.push(`El archivo "${outputPath}" quedo vacio (0 bytes).`);
    }
  }

  if (!log.exists && problems.length === 0 && !dialogTitle) {
    problems.push(
      `El ejecutable no escribio el log "${logPath}", asi que no llego a procesar nada. Causas conocidas: `
      + 'la empresa esta abierta en otra sesion de SIIGO Pyme (cierre las ventanas de SIIGO y reintente), '
      + 'la licencia no se encuentra o esta vencida, no hay sesion de escritorio interactiva, '
      + 'o alguna ruta supera los 50 caracteres que admite el CLI.',
    );
  }

  return {
    ok: problems.length === 0,
    problems,
    exitCode,
    timedOut,
    dialogTitle,
    moduleUnavailable: log.moduleUnavailable,
    durationMs,
    commandLine,
    logPath,
    log,
    outputPath,
    outputBytes,
    errorLogPath,
    excelResult,
    resolvedParams: resolved,
  };
}

/**
 * Titulos que delatan un cuadro de dialogo de error esperando un clic.
 *
 * El observado en la practica es "SIIGO ha encontrado la siguiente inconsistencia". Se
 * incluyen otras formulas habituales del producto. Un titulo que no encaje aqui se deja
 * pasar: puede ser una ventana de progreso legitima durante una exportacion larga.
 */
const DIALOG_TITLE_PATTERNS = [
  /inconsistencia/i,
  /\berrors?\b/i,
  /advertencia/i,
  /\baviso\b/i,
  /confirmar|confirmaci/i,
  /atenci[oó]n/i,
];

/** Titulo de la ventana principal del proceso, o null si no tiene ninguna. */
async function windowTitleOf(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'tasklist',
      ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH', '/V'],
      { windowsHide: true },
    );
    // La ultima columna del CSV de `tasklist /V` es el titulo de la ventana.
    const line = stdout.trim().split(/\r?\n/)[0] ?? '';
    const fields = line.match(/"([^"]*)"/g);
    if (!fields || fields.length === 0) return null;
    const title = fields[fields.length - 1]!.slice(1, -1).trim();
    return title === 'N/A' || title.length === 0 ? null : title;
  } catch {
    return null;
  }
}

const POLL_MS = 2_000;
/** Un dialogo debe verse en dos sondeos seguidos: evita matar por una ventana transitoria. */
const DIALOG_CONFIRMATIONS = 2;

function spawnAndWait(
  exePath: string,
  argv: string[],
  cwd: string,
  timeoutMs: number,
  onProgress?: (elapsedMs: number) => void,
): Promise<{ exitCode: number | null; timedOut: boolean; dialogTitle: string | null }> {
  return new Promise((resolve, reject) => {
    // stdio ignorado a proposito: ver la nota 1 del encabezado del archivo.
    //
    // windowsHide NO se activa, aunque seria lo natural para un servidor: SIIGO abre una
    // ventana de progreso ("IYG-SIIGO Generacion de modelo ...") y despues conduce Excel
    // por COM. Con la ventana oculta el proceso se queda colgado sin escribir el log ni
    // generar el xlsx; con ella visible el mismo comando termina en ~50 s. Es el precio de
    // automatizar una aplicacion de escritorio: durante la ejecucion se ven las ventanas.
    const child = spawn(exePath, argv, { cwd, stdio: 'ignore', windowsHide: false });

    const startedAt = Date.now();
    let timedOut = false;
    let dialogTitle: string | null = null;
    let seenTimes = 0;
    let finished = false;
    let polling = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killTree(child.pid);
    }, timeoutMs);

    const poller = setInterval(() => {
      if (finished || polling || !child.pid) return;
      polling = true;

      onProgress?.(Date.now() - startedAt);

      void windowTitleOf(child.pid)
        .then((title) => {
          if (finished) return;
          if (title && DIALOG_TITLE_PATTERNS.some((re) => re.test(title))) {
            seenTimes += 1;
            if (seenTimes >= DIALOG_CONFIRMATIONS) {
              dialogTitle = title;
              if (child.pid) killTree(child.pid);
            }
          } else {
            seenTimes = 0;
          }
        })
        .finally(() => {
          polling = false;
        });
    }, POLL_MS);

    const cleanup = () => {
      finished = true;
      clearTimeout(timer);
      clearInterval(poller);
    };

    child.on('error', (err) => {
      cleanup();
      reject(new Error(`No se pudo ejecutar "${exePath}": ${err.message}`));
    });

    child.on('close', (code) => {
      cleanup();
      resolve({ exitCode: code, timedOut, dialogTitle });
    });
  });
}
