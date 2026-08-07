/**
 * Interpretacion del log que escribe `EXCELSIIGO.exe`.
 *
 * El log es texto plano en cp1252 con mensajes del estilo `NNN <descripcion>`. No es JSON
 * y no existe un contrato formal, asi que la deteccion de errores es por patrones. Los
 * codigos que si estan documentados o se han visto en la practica se traducen a un
 * mensaje util para el agente.
 */
import { readFile } from 'node:fs/promises';
import iconv from 'iconv-lite';

/** Codigos de error del CLI vistos en el manual y en ejecuciones reales. */
const CODIGOS: Record<string, string> = {
  '002': 'Nombre de funcion no definido en ExcelSiigo.',
  '016': 'Usuario o clave de SIIGO incorrectos.',
  '020': 'El modulo que necesita esta funcion no esta instalado en esta empresa.',
  '070': 'No se pudo abrir o localizar un archivo requerido.',
  '081': 'Los parametros de la funcion tienen errores (orden o formato del argv).',
  '105': 'La empresa no tiene habilitado el modulo que necesita esta funcion.',
};

/**
 * Codigos que indican que la funcion no aplica a esta empresa, no que algo se haya roto.
 *
 * Se dan cuando SIIGO Pyme esta licenciado sin un modulo: pedir seriales o nomina a una
 * empresa que no los tiene devuelve estos codigos. Conviene distinguirlos de un fallo real
 * para que quien automatice pueda saltarse esas funciones en vez de reintentarlas.
 */
const CODIGOS_NO_DISPONIBLE = new Set(['020', '105']);

export interface ParsedLog {
  /** Contenido decodificado. Cadena vacia si el archivo no existe o esta vacio. */
  text: string;
  /** Numero de lineas no vacias. */
  lines: number;
  /** Lineas que parecen reportar un error. */
  errors: string[];
  /** Ultimas lineas no vacias, para dar contexto sin volcar el log entero. */
  tail: string[];
  /**
   * La funcion no aplica a esta empresa porque le falta el modulo (seriales, nomina...).
   * No es un fallo del servidor ni de los parametros.
   */
  moduleUnavailable: boolean;
  /** Si el archivo existia. */
  exists: boolean;
}

const ERROR_PATTERNS = [
  /error/i,
  /excepcion|excepción/i,
  /no se encuentra/i,
  /no existe/i,
  /no se pudo/i,
  /invalid|no permitid/i,
];

/** Los mensajes del CLI empiezan por un codigo de tres digitos. `000` es informativo. */
const CODE_LINE = /^(\d{3})\s+(.*)$/;

export function parseLogText(text: string): Omit<ParsedLog, 'exists'> {
  const all = text.split(/\r?\n/).map((l) => l.trimEnd());
  const nonEmpty = all.filter((l) => l.trim().length > 0);

  const errors: string[] = [];
  let moduleUnavailable = false;

  for (const line of nonEmpty) {
    const code = CODE_LINE.exec(line.trim());
    if (code && code[1] !== '000') {
      if (CODIGOS_NO_DISPONIBLE.has(code[1]!)) moduleUnavailable = true;
      const explicacion = CODIGOS[code[1]!];
      errors.push(explicacion ? `${line.trim()} — ${explicacion}` : line.trim());
      continue;
    }
    if (ERROR_PATTERNS.some((re) => re.test(line))) errors.push(line.trim());
  }

  return { text, lines: nonEmpty.length, errors, tail: nonEmpty.slice(-20), moduleUnavailable };
}

export async function readSiigoLog(logPath: string): Promise<ParsedLog> {
  try {
    const buf = await readFile(logPath);
    return { ...parseLogText(iconv.decode(buf, 'win1252')), exists: true };
  } catch {
    return { text: '', lines: 0, errors: [], tail: [], moduleUnavailable: false, exists: false };
  }
}

/**
 * Resultado que deja `SiigoExcel.exe` (la capa que habla con Excel por COM) en
 * `<instalacion>\SiigoExcelLOG.txt`. Es la unica senal con formato estable.
 *
 * Solo se considera si el archivo se escribio despues de arrancar la corrida; si es
 * viejo pertenece a otra ejecucion y se ignora.
 */
export interface SiigoExcelResult {
  success: boolean;
  resultMessage: string;
}

export async function readSiigoExcelResult(
  installationDir: string,
  startedAt: number,
): Promise<SiigoExcelResult | null> {
  const target = `${installationDir.replace(/\\+$/, '')}\\SiigoExcelLOG.txt`;
  try {
    const { stat } = await import('node:fs/promises');
    const info = await stat(target);
    if (info.mtimeMs < startedAt) return null;

    const raw = iconv.decode(await readFile(target), 'win1252');
    const match = /\{[\s\S]*?\}/.exec(raw);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as { success?: string | boolean; resultMessage?: string };
    return {
      success: parsed.success === true || String(parsed.success).toLowerCase() === 'true',
      resultMessage: parsed.resultMessage ?? '',
    };
  } catch {
    return null;
  }
}
