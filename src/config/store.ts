/**
 * Configuracion persistente del servidor: `%APPDATA%\siigo-pyme-mcp\config.json`.
 *
 * Guarda credenciales de SIIGO (una por defecto para todas las empresas y overrides por
 * empresa), alias legibles, instalaciones declaradas a mano y la carpeta de salida.
 *
 * La clave nunca se devuelve por ninguna herramienta MCP ni se escribe en mensajes de
 * error; solo viaja hacia el argv del ejecutable.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export interface Credentials {
  user: string;
  password: string;
}

export interface CompanyConfig {
  alias?: string;
  user?: string;
  password?: string;
  /** Anio de proceso por defecto para esta empresa. */
  year?: string;
}

export interface SiigoConfig {
  /** Instalaciones adicionales que el autodescubrimiento no encuentra. */
  installations: string[];
  defaultCredentials?: Credentials;
  /** Clave: ruta de empresa normalizada en mayusculas. Ej: `Z:\SIIWI01\`. */
  companies: Record<string, CompanyConfig>;
  /** Carpeta donde se dejan los .xlsx generados. Corta a proposito: el CLI limita a 50 caracteres. */
  outputDir: string;
  /** Norma por defecto: L (local) o N (NIIF). */
  norma: 'L' | 'N';
  /** Milisegundos antes de matar una corrida colgada. */
  timeoutMs: number;
}

export const DEFAULT_OUTPUT_DIR = 'C:\\SiigoMCP\\out';

const EMPTY: SiigoConfig = {
  installations: [],
  companies: {},
  outputDir: DEFAULT_OUTPUT_DIR,
  norma: 'L',
  // 3 minutos: suficiente para una exportacion grande y lo bastante corto para no dejar la
  // cola bloqueada mucho rato si SIIGO se queda esperando en un dialogo que no reconocimos.
  timeoutMs: 180_000,
};

export function configDir(): string {
  const base = process.env.SIIGO_MCP_CONFIG_DIR
    ?? (process.env.APPDATA ? path.join(process.env.APPDATA, 'siigo-pyme-mcp') : path.join(homedir(), '.siigo-pyme-mcp'));
  return base;
}

export function configPath(): string {
  return path.join(configDir(), 'config.json');
}

/** Clave canonica de una empresa dentro del config. */
export function companyKey(companyPath: string): string {
  const p = companyPath.trim().replace(/\//g, '\\');
  return (p.endsWith('\\') ? p : `${p}\\`).toUpperCase();
}

export async function loadConfig(): Promise<SiigoConfig> {
  try {
    const raw = await readFile(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<SiigoConfig>;
    return {
      ...EMPTY,
      ...parsed,
      installations: parsed.installations ?? [],
      companies: parsed.companies ?? {},
      outputDir: parsed.outputDir || DEFAULT_OUTPUT_DIR,
      norma: parsed.norma === 'N' ? 'N' : 'L',
      timeoutMs: typeof parsed.timeoutMs === 'number' && parsed.timeoutMs > 0 ? parsed.timeoutMs : EMPTY.timeoutMs,
    };
  } catch {
    return { ...EMPTY, companies: {}, installations: [] };
  }
}

export async function saveConfig(config: SiigoConfig): Promise<string> {
  const dir = configDir();
  await mkdir(dir, { recursive: true });
  const target = configPath();
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return target;
}

/**
 * Resuelve usuario y clave para una empresa.
 *
 * Precedencia: valores explicitos de la llamada > variables de entorno > override por
 * empresa en el config > credencial por defecto del config.
 */
export function resolveCredentials(
  config: SiigoConfig,
  companyPath: string,
  explicit?: Partial<Credentials>,
): Credentials {
  const key = companyKey(companyPath);
  const perCompany = config.companies[key];

  const user =
    explicit?.user
    ?? process.env.SIIGO_USUARIO
    ?? perCompany?.user
    ?? config.defaultCredentials?.user;

  const password =
    explicit?.password
    ?? process.env.SIIGO_CLAVE
    ?? perCompany?.password
    ?? config.defaultCredentials?.password;

  if (!user || !password) {
    throw new Error(
      `No hay credenciales de SIIGO para ${companyPath}. Configure una credencial por defecto con la herramienta `
      + 'siigo_set_credentials, o defina las variables de entorno SIIGO_USUARIO y SIIGO_CLAVE.',
    );
  }

  return { user, password };
}

/** Anio de proceso por defecto: el configurado para la empresa, si no el anio actual. */
export function resolveYear(config: SiigoConfig, companyPath: string, explicit?: string): string {
  if (explicit) return explicit;
  const perCompany = config.companies[companyKey(companyPath)];
  if (perCompany?.year) return perCompany.year;
  if (process.env.SIIGO_ANO) return process.env.SIIGO_ANO;
  return String(new Date().getFullYear());
}
