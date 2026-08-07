/**
 * Traduccion de valores amigables al argv posicional exacto que espera `EXCELSIIGO.exe`.
 *
 * El binario NO acepta flags. Si un argumento llega fuera de orden o mal formateado
 * responde `081 Parametros de la funcion GET tienen errores` y termina con codigo 0, asi
 * que un error aqui se manifiesta como un exito silencioso. Este modulo es puro (no toca
 * el disco) para poder cubrirlo con los tests dorados del manual.
 */
import type { FunctionSpec, ParamSpec } from '../catalog/types.js';

/** Longitud maxima que el manual documenta para `NombreLog` y `NombreArchivoExcelSalida`. */
export const MAX_PATH_ARG = 50;

/** Error de validacion que cita el nombre del parametro tal como lo llama el manual. */
export class SiigoArgError extends Error {
  constructor(
    public readonly param: string,
    message: string,
  ) {
    super(message);
    this.name = 'SiigoArgError';
  }
}

/** Los siete argumentos que preceden a los parametros de cualquier funcion. */
export interface CommonArgs {
  /** Ruta de la empresa con backslash final. Ej: `Z:\SIIWI01\`. */
  companyPath: string;
  /** Anio de proceso, 4 digitos. */
  year: string;
  /** `L` (local) o `N` (NIIF). */
  norma: string;
  /** Usuario de SIIGO, hasta 8 caracteres. */
  user: string;
  /** Clave del usuario, hasta 8 caracteres. Nunca se registra en logs ni respuestas. */
  password: string;
  /** Ruta del log que escribe el propio ejecutable. */
  logPath: string;
}

export interface BuildResult {
  /** Argumentos para `spawn`, sin el nombre del ejecutable. */
  argv: string[];
  /** Valor final de cada parametro de la funcion, ya formateado. */
  resolved: Record<string, string>;
}

const COMPANY_RE = /^[A-Za-z]:\\SIIWI\d{2}\\$/;

function assertNoWhitespace(param: string, cli: string, value: string): void {
  if (/\s/.test(value)) {
    throw new SiigoArgError(
      param,
      `${cli}: no puede contener espacios. El CLI de SIIGO separa los argumentos por espacios y el valor "${value}" se partiria en dos.`,
    );
  }
}

function formatDigits(p: ParamSpec, raw: string): string {
  if (p.type.kind !== 'digits') throw new Error('formatDigits llamado con otro tipo');
  const { len, pad } = p.type;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) {
    throw new SiigoArgError(p.name, `${p.cli}: se esperaban solo digitos (maximo ${len}), se recibio "${raw}".`);
  }
  if (value.length > len) {
    throw new SiigoArgError(p.name, `${p.cli}: maximo ${len} digitos, se recibieron ${value.length} ("${raw}").`);
  }
  return pad ? value.padStart(len, '0') : value;
}

/** Acepta `MMDD`, `MM-DD` y `AAAA-MM-DD`; siempre devuelve `MMDD`. */
function formatMmdd(p: ParamSpec, raw: string): string {
  const value = raw.trim();
  let mm: string;
  let dd: string;

  const iso = /^\d{4}-(\d{2})-(\d{2})$/.exec(value);
  const short = /^(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    mm = iso[1]!;
    dd = iso[2]!;
  } else if (short) {
    mm = short[1]!;
    dd = short[2]!;
  } else if (/^\d{4}$/.test(value)) {
    mm = value.slice(0, 2);
    dd = value.slice(2, 4);
  } else {
    throw new SiigoArgError(
      p.name,
      `${p.cli}: formato MMDD de 4 digitos (tambien se acepta AAAA-MM-DD), se recibio "${raw}".`,
    );
  }

  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12) {
    throw new SiigoArgError(p.name, `${p.cli}: mes fuera de rango en "${raw}".`);
  }
  if (day < 1 || day > 31) {
    throw new SiigoArgError(p.name, `${p.cli}: dia fuera de rango en "${raw}".`);
  }
  return `${mm}${dd}`;
}

/** Acepta `AAAAMMDD` y `AAAA-MM-DD`. Deja pasar los centinelas `0`/`00000000`/`99999999`. */
function formatYyyymmdd(p: ParamSpec, raw: string): string {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  if (/^\d{1,8}$/.test(value)) return value;
  throw new SiigoArgError(
    p.name,
    `${p.cli}: formato AAAAMMDD de 8 digitos (tambien se acepta AAAA-MM-DD), se recibio "${raw}".`,
  );
}

function formatEnum(p: ParamSpec, raw: string): string {
  if (p.type.kind !== 'enum') throw new Error('formatEnum llamado con otro tipo');
  const value = raw.trim();
  const upper = value.toUpperCase();
  const match = p.type.values.find((v) => v.toUpperCase() === upper);
  if (!match) {
    throw new SiigoArgError(
      p.name,
      `${p.cli}: valor no permitido "${raw}". Valores validos: ${p.type.values.join(', ')}.`,
    );
  }
  return match;
}

function formatText(p: ParamSpec, raw: string): string {
  if (p.type.kind !== 'text') throw new Error('formatText llamado con otro tipo');
  const value = raw.trim();
  if (value.length === 0) {
    throw new SiigoArgError(p.name, `${p.cli}: no puede quedar vacio.`);
  }
  if (value.length > p.type.max) {
    throw new SiigoArgError(
      p.name,
      `${p.cli}: maximo ${p.type.max} caracteres, se recibieron ${value.length} ("${raw}").`,
    );
  }
  assertNoWhitespace(p.name, p.cli, value);
  return value;
}

function formatPath(p: ParamSpec, raw: string, opts: { requireXlsx: boolean }): string {
  const value = raw.trim();
  if (value.length === 0) {
    throw new SiigoArgError(p.name, `${p.cli}: no puede quedar vacio.`);
  }
  if (value.length > MAX_PATH_ARG) {
    throw new SiigoArgError(
      p.name,
      `${p.cli}: el manual limita esta ruta a ${MAX_PATH_ARG} caracteres y "${value}" tiene ${value.length}. Use una carpeta de salida mas corta.`,
    );
  }
  assertNoWhitespace(p.name, p.cli, value);
  if (opts.requireXlsx && !/\.xlsx?$/i.test(value)) {
    throw new SiigoArgError(p.name, `${p.cli}: la ruta debe terminar en .xlsx o .xls, se recibio "${value}".`);
  }
  return value;
}

function formatParam(p: ParamSpec, raw: string): string {
  switch (p.type.kind) {
    case 'digits':
      return formatDigits(p, raw);
    case 'mmdd':
      return formatMmdd(p, raw);
    case 'yyyymmdd':
      return formatYyyymmdd(p, raw);
    case 'enum':
      return formatEnum(p, raw);
    case 'text':
      return formatText(p, raw);
    case 'outfile':
      return formatPath(p, raw, { requireXlsx: true });
    case 'infile':
      return formatPath(p, raw, { requireXlsx: true });
    case 'errlog':
      return formatPath(p, raw, { requireXlsx: false });
  }
}

/** Normaliza la ruta de empresa: agrega el backslash final y valida el patron `X:\SIIWInn\`. */
export function normalizeCompanyPath(raw: string): string {
  const value = raw.trim().replace(/\//g, '\\');
  const withSlash = value.endsWith('\\') ? value : `${value}\\`;
  if (!COMPANY_RE.test(withSlash)) {
    throw new SiigoArgError(
      'companyPath',
      `RutaEmpresa: se esperaba una ruta de empresa SIIGO con el formato X:\\SIIWInn\\ (11 caracteres), se recibio "${raw}".`,
    );
  }
  return withSlash.toUpperCase().replace(/^([A-Z]):/, (_m, d: string) => `${d}:`);
}

function validateCommon(common: CommonArgs): CommonArgs {
  const companyPath = normalizeCompanyPath(common.companyPath);

  const year = common.year.trim();
  if (!/^\d{4}$/.test(year)) {
    throw new SiigoArgError('year', `Anio: se esperaban 4 digitos, se recibio "${common.year}".`);
  }

  const norma = common.norma.trim().toUpperCase();
  if (norma !== 'L' && norma !== 'N') {
    throw new SiigoArgError('norma', `Norma: solo se admite L (local) o N (NIIF), se recibio "${common.norma}".`);
  }

  const user = common.user.trim();
  if (user.length === 0 || user.length > 8) {
    throw new SiigoArgError('user', 'Usuario: se requiere un usuario de SIIGO de 1 a 8 caracteres.');
  }
  assertNoWhitespace('user', 'Usuario', user);

  const password = common.password;
  if (password.length === 0 || password.length > 8) {
    // El mensaje nunca incluye el valor.
    throw new SiigoArgError('password', 'Clave: se requiere una clave de SIIGO de 1 a 8 caracteres.');
  }
  assertNoWhitespace('password', 'Clave', password);

  const logPath = common.logPath.trim();
  if (logPath.length === 0 || logPath.length > MAX_PATH_ARG) {
    throw new SiigoArgError(
      'logPath',
      `NombreLog: el manual limita el nombre del log a ${MAX_PATH_ARG} caracteres, se recibio uno de ${logPath.length}.`,
    );
  }
  assertNoWhitespace('logPath', 'NombreLog', logPath);

  return { companyPath, year, norma, user, password, logPath };
}

/**
 * Construye el argv completo de una funcion.
 *
 * `input` usa los nombres camelCase del catalogo. Los parametros ausentes toman su
 * `default`; los que no tienen default son obligatorios. Para `outfile`/`errlog` el
 * default declarado es la cadena vacia, senal de que el llamador debe haber inyectado
 * una ruta generada antes de llegar aqui.
 */
export function buildArgv(
  fn: FunctionSpec,
  common: CommonArgs,
  input: Record<string, unknown>,
): BuildResult {
  const c = validateCommon(common);
  const argv = [c.companyPath, c.year, fn.name, c.norma, c.user, c.password, c.logPath];
  const resolved: Record<string, string> = {};

  for (const p of fn.params) {
    const provided = input[p.name];
    const raw =
      provided === undefined || provided === null || provided === ''
        ? p.default
        : String(provided);

    if (raw === undefined || raw === '') {
      throw new SiigoArgError(p.name, `${p.cli}: es obligatorio y no se recibio ningun valor.`);
    }

    const value = formatParam(p, raw);
    resolved[p.name] = value;
    argv.push(value);
  }

  return { argv, resolved };
}

/** Reconstruye la linea de comando para mostrarla, con la clave siempre enmascarada. */
export function redactedCommandLine(exePath: string, argv: string[]): string {
  const safe = argv.map((a, i) => (i === 5 ? '********' : a));
  return [exePath, ...safe].join(' ');
}
