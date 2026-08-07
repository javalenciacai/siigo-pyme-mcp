/**
 * Sondas de Windows para el diagnostico, y los parsers puros que las interpretan.
 *
 * Los parsers se exportan y se prueban con salidas literales capturadas de Windows en espanol
 * y en ingles. Las sondas nunca lanzan: si el comando falla, devuelven un resultado vacio y el
 * chequeo queda como `desconocido`, que es informacion honesta.
 *
 * Regla dura de todo este directorio: aqui no se ejecuta `EXCELSIIGO.exe` ni se instancia Excel
 * por COM. Lanzar Excel para comprobar que existe seria lento, dejaria procesos huerfanos y en
 * una maquina sin escritorio se colgaria — que es justo el fallo que queremos diagnosticar.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ExcelInfo, SessionInfo } from './types.js';

const TIMEOUT_MS = 5_000;

/** Ejecuta un comando y devuelve su stdout, o `null` si falla por cualquier motivo. */
function run(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: TIMEOUT_MS }, (err, stdout) => {
      resolve(err ? null : stdout);
    });
  });
}

/**
 * Extrae los campos de una fila CSV de `tasklist /FO CSV /NH`.
 * Se parsea por posicion, nunca por nombre de columna: los encabezados cambian con el idioma
 * de Windows ("Nombre de sesion" frente a "Session Name").
 */
export function parseTasklistCsvRow(stdout: string): string[] | null {
  const linea = stdout.split(/\r?\n/).find((l) => l.trim().startsWith('"'));
  if (!linea) return null;
  const campos = linea.match(/"([^"]*)"/g);
  if (!campos) return null;
  return campos.map((c) => c.slice(1, -1));
}

/** Valor por defecto de una clave del registro, tal como lo imprime `reg query ... /ve`. */
export function parseRegDefaultValue(stdout: string): string | null {
  // Windows imprime "(Predeterminado)" o "(Default)" segun el idioma, asi que se ancla en el
  // tipo (REG_SZ / REG_EXPAND_SZ), que es invariante.
  const m = stdout.match(/REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m);
  return m?.[1]?.trim() ?? null;
}

/** Valor con nombre de una clave del registro. */
export function parseRegValue(stdout: string, name: string): string | null {
  const escapado = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = stdout.match(new RegExp(`${escapado}\\s+REG_(?:EXPAND_)?SZ\\s+(.+?)\\s*$`, 'm'));
  return m?.[1]?.trim() ?? null;
}

const APP_PATHS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\excel.exe',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\excel.exe',
];

const PROGID_KEYS = ['HKLM\\SOFTWARE\\Classes\\Excel.Application\\CurVer', 'HKCU\\SOFTWARE\\Classes\\Excel.Application\\CurVer'];

/** Rutas tipicas de Office, como ultimo recurso. Office16 = 2016/2019/2021/365. */
function rutasConocidas(env: Record<string, string | undefined>): string[] {
  const bases = [env['ProgramFiles'], env['ProgramFiles(x86)']].filter((b): b is string => Boolean(b));
  const rutas: string[] = [];
  for (const base of bases) {
    rutas.push(path.join(base, 'Microsoft Office', 'root', 'Office16', 'EXCEL.EXE'));
    for (const v of ['Office16', 'Office15', 'Office14', 'Office12']) {
      rutas.push(path.join(base, 'Microsoft Office', v, 'EXCEL.EXE'));
    }
  }
  return rutas;
}

/**
 * Detecta Excel en cascada, primer acierto gana:
 *  1. App Paths del registro. Fiabilidad alta: es la unica senal que da una ruta verificable
 *     en disco, y la registran tanto el MSI como Click-to-Run y la version de la Store.
 *  2. El ProgID COM `Excel.Application`, que es literalmente lo que necesita SiigoExcel.exe.
 *     Fiabilidad media-alta: puede sobrevivir a una desinstalacion sucia, asi que si solo
 *     acierta este, quien llama lo degrada a aviso.
 *  3. Rutas conocidas de Office. Red de seguridad.
 */
export async function detectExcel(env: Record<string, string | undefined>): Promise<ExcelInfo> {
  for (const key of APP_PATHS) {
    const stdout = await run('reg', ['query', key, '/ve']);
    if (!stdout) continue;
    const ruta = parseRegDefaultValue(stdout)?.replace(/^"|"$/g, '');
    if (ruta && existsSync(ruta)) {
      return { encontrado: true, exePath: ruta, metodo: 'app-paths', version: versionDeRuta(ruta) };
    }
  }

  for (const key of PROGID_KEYS) {
    const stdout = await run('reg', ['query', key, '/ve']);
    const progid = stdout ? parseRegDefaultValue(stdout) : null;
    if (progid) return { encontrado: true, exePath: null, metodo: 'progid', version: progid };
  }

  for (const ruta of rutasConocidas(env)) {
    if (existsSync(ruta)) {
      return { encontrado: true, exePath: ruta, metodo: 'ruta-conocida', version: versionDeRuta(ruta) };
    }
  }

  return { encontrado: false, exePath: null, metodo: 'ninguno', version: null };
}

function versionDeRuta(ruta: string): string | null {
  const m = ruta.match(/Office(\d+)/i);
  return m ? `Office${m[1]}` : null;
}

/**
 * Determina si hay una sesion de escritorio utilizable.
 *
 * La senal fiable es la sesion del propio proceso: sesion 0 o nombre `Services` significa que
 * no hay escritorio (aislamiento de la sesion 0 desde Windows Vista), y ahi Excel por COM no
 * funciona. `SESSIONNAME` y las variables de SSH solo aportan matices.
 */
export async function detectSession(env: Record<string, string | undefined>): Promise<SessionInfo> {
  const indicios: string[] = [];
  let sessionId: number | null = null;
  let sessionName: string | null = null;

  const stdout = await run('tasklist', ['/FI', `PID eq ${process.pid}`, '/FO', 'CSV', '/NH']);
  const campos = stdout ? parseTasklistCsvRow(stdout) : null;
  if (campos && campos.length >= 4) {
    // Columnas: Imagen, PID, Nombre de sesion, Sesion#, Uso de memoria.
    sessionName = campos[2] || null;
    const n = Number.parseInt(campos[3] ?? '', 10);
    if (Number.isFinite(n)) sessionId = n;
  }

  const envSession = env['SESSIONNAME'];
  if (envSession) {
    sessionName ??= envSession;
    if (/^RDP-/i.test(envSession)) {
      indicios.push('sesion remota (RDP): si se desconecta, Excel por COM deja de funcionar');
    }
  } else {
    indicios.push('SESSIONNAME no esta definida');
  }

  if (env['SSH_CONNECTION'] || env['SSH_CLIENT']) {
    indicios.push('la sesion viene por SSH, que no da un escritorio utilizable para Excel');
  }
  if (env['USERNAME'] === 'ContainerAdministrator') {
    indicios.push('parece un contenedor de Windows, sin escritorio');
  }

  let interactiva: boolean | null;
  if (sessionId === null && sessionName === null) {
    interactiva = null;
  } else if (sessionId === 0 || /^Services$/i.test(sessionName ?? '')) {
    interactiva = false;
    indicios.push('la sesion 0 esta aislada: los procesos de ahi no tienen escritorio');
  } else {
    interactiva = true;
  }

  return { sessionName, sessionId, interactiva, indicios };
}

const PROCESOS_VIGILADOS = [/^EXCELSIIGO\.exe$/i, /^SiigoExcel\.exe$/i, /^SIIWIN.*\.exe$/i, /^EXCEL\.EXE$/i];

/** Procesos de SIIGO o Excel vivos. Una empresa abierta en otra sesion deja el log vacio. */
export async function siigoProcesosActivos(): Promise<string[]> {
  const stdout = await run('tasklist', ['/FO', 'CSV', '/NH']);
  if (!stdout) return [];
  const vivos = new Set<string>();
  for (const linea of stdout.split(/\r?\n/)) {
    const imagen = linea.match(/^"([^"]+)"/)?.[1];
    if (imagen && PROCESOS_VIGILADOS.some((re) => re.test(imagen))) vivos.add(imagen);
  }
  return [...vivos];
}
