/**
 * Descubrimiento de instalaciones de SIIGO Pyme y de las empresas que administra cada una.
 *
 * Una instalacion es una carpeta con `EXCELSIIGO.exe` (por defecto `C:\Siigo`, pero puede
 * haber varias: `C:\Siigo2`, `D:\Siigo`...). Cada instalacion declara en `filepath.txt` la
 * ruta de UNA empresa; las demas viven junto a ella como `SIIWI01`..`SIIWI99`.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { SiigoConfig } from '../config/store.js';
import { companyKey } from '../config/store.js';
import { readFilePathTxt, type FilePathInfo } from './filepath.js';

const execFileAsync = promisify(execFile);

export const EXE_NAME = 'EXCELSIIGO.exe';

export interface Installation {
  /** Carpeta de la instalacion, sin backslash final. Ej: `C:\Siigo`. */
  dir: string;
  /** Ruta completa de `EXCELSIIGO.exe`. */
  exePath: string;
  /** Version reportada por el registro de Windows, si esta disponible. */
  version: string | null;
  /** Como se encontro: registro de Windows, configuracion del usuario o escaneo de discos. */
  source: 'registry' | 'config' | 'scan';
  /** Contenido de `filepath.txt`, si existe. */
  filePath: FilePathInfo | null;
}

export interface Company {
  /** Ruta normalizada con backslash final. Ej: `Z:\SIIWI01\`. */
  path: string;
  /** Numero de empresa. Ej: `01`. */
  number: string;
  /** Nombre legible: alias del config, o el nombre del recurso UNC como respaldo. */
  alias: string | null;
  /** Instalaciones desde las que se llego a esta empresa. */
  installations: string[];
  /** Si la empresa es la que declara `filepath.txt` de alguna instalacion. */
  declared: boolean;
  /** Si hay credenciales resolubles para ella. */
  hasCredentials: boolean;
  /**
   * Si la carpeta responde ahora mismo. Una empresa declarada en `filepath.txt` puede
   * estar en una unidad de red caida; se sigue listando, pero marcada.
   */
  reachable: boolean;
}

/** Lee `Programas` del registro. Devuelve null si la clave no existe. */
async function readRegistryInstallation(): Promise<{ dir: string; version: string | null } | null> {
  const keys = [
    'HKLM\\SOFTWARE\\WOW6432Node\\Informatica y Gestion S.A\\Siigo Windows',
    'HKLM\\SOFTWARE\\Informatica y Gestion S.A\\Siigo Windows',
  ];

  for (const key of keys) {
    try {
      const { stdout } = await execFileAsync('reg', ['query', key], { windowsHide: true });
      const dir = /Programas\s+REG_SZ\s+(.+)/i.exec(stdout)?.[1]?.trim();
      const version = /Version\s+REG_SZ\s+(.+)/i.exec(stdout)?.[1]?.trim() ?? null;
      if (dir) return { dir: dir.replace(/\\+$/, ''), version };
    } catch {
      // La clave no existe en esta maquina; se intenta la siguiente.
    }
  }
  return null;
}

/** Letras de unidad montadas, de A: a Z:. */
function mountedDrives(): string[] {
  const drives: string[] = [];
  for (let c = 'A'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
    const root = `${String.fromCharCode(c)}:\\`;
    if (existsSync(root)) drives.push(root);
  }
  return drives;
}

/** Busca carpetas `<unidad>:\Siigo*` que contengan el ejecutable. */
async function scanForInstallations(): Promise<string[]> {
  const found: string[] = [];
  for (const root of mountedDrives()) {
    let entries: string[];
    try {
      entries = await readdir(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!/^siigo/i.test(entry)) continue;
      const dir = path.join(root, entry);
      if (existsSync(path.join(dir, EXE_NAME))) found.push(dir.replace(/\\+$/, ''));
    }
  }
  return found;
}

export async function listInstallations(config: SiigoConfig): Promise<Installation[]> {
  const byDir = new Map<string, Installation>();

  const add = async (dir: string, source: Installation['source'], version: string | null) => {
    const clean = dir.replace(/\\+$/, '');
    const key = clean.toUpperCase();
    if (byDir.has(key)) {
      const existing = byDir.get(key)!;
      if (existing.version === null && version !== null) existing.version = version;
      return;
    }
    const exePath = path.join(clean, EXE_NAME);
    if (!existsSync(exePath)) return;
    byDir.set(key, {
      dir: clean,
      exePath,
      version,
      source,
      filePath: await readFilePathTxt(path.join(clean, 'filepath.txt')),
    });
  };

  const registry = await readRegistryInstallation();
  if (registry) await add(registry.dir, 'registry', registry.version);
  for (const dir of config.installations) await add(dir, 'config', null);
  for (const dir of await scanForInstallations()) await add(dir, 'scan', null);

  return [...byDir.values()];
}

/**
 * Marcadores de datos propios de SIIGO: los archivos COBOL `ZnnSIIGO`, la configuracion de
 * impresion `CONFIMP.CFG` y los diccionarios `.DIS`.
 *
 * Deliberadamente NO valen `TEMP` ni `LOGS`: son demasiado genericos. En esta maquina
 * existe un `C:\SIIWI01` que solo contiene una carpeta `LOGS` y unos logs sueltos, creado
 * por error por una herramienta anterior al confundir rutas; con un marcador debil se
 * ofreceria como empresa real.
 */
const COMPANY_MARKERS = [/^Z\d+SIIGO(\.IDX)?$/i, /^CONFIMP\.CFG$/i, /\.DIS$/i];

/**
 * Una carpeta `SIIWInn` solo cuenta como empresa si trae datos de SIIGO.
 *
 * En una maquina real `Z:\SIIWI00` existe pero contiene el instalador y las
 * actualizaciones, no una empresa; sin este filtro se ofreceria como si lo fuera.
 */
async function looksLikeCompany(dir: string): Promise<boolean> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return false;
  }
  return entries.some((e) => COMPANY_MARKERS.some((re) => re.test(e)));
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Enumera las empresas visibles.
 *
 * Para cada instalacion se toma la empresa declarada en `filepath.txt`, se sube a su
 * carpeta padre y se buscan ahi `SIIWI00`..`SIIWI99`. Se agregan tambien las empresas que
 * el usuario haya configurado a mano.
 */
export async function listCompanies(
  installations: Installation[],
  config: SiigoConfig,
  hasCredentials: (companyPath: string) => boolean,
): Promise<Company[]> {
  const byPath = new Map<string, Company>();

  const add = (companyPath: string, installDir: string | null, declared: boolean, fallbackAlias: string | null) => {
    const key = companyKey(companyPath);
    const existing = byPath.get(key);
    if (existing) {
      if (installDir && !existing.installations.includes(installDir)) existing.installations.push(installDir);
      existing.declared ||= declared;
      return;
    }
    byPath.set(key, {
      path: key,
      number: /SIIWI(\d+)/i.exec(key)?.[1] ?? '??',
      alias: config.companies[key]?.alias ?? fallbackAlias,
      installations: installDir ? [installDir] : [],
      declared,
      hasCredentials: hasCredentials(key),
      reachable: existsSync(key),
    });
  };

  for (const install of installations) {
    const declaredPath = install.filePath?.companyPath;
    if (!declaredPath) continue;

    add(declaredPath, install.dir, true, install.filePath?.shareName ?? null);

    const parent = path.dirname(declaredPath.replace(/\\+$/, ''));
    for (let n = 0; n <= 99; n++) {
      const name = `SIIWI${String(n).padStart(2, '0')}`;
      const dir = path.join(parent, name);
      if (!(await isDirectory(dir))) continue;
      if (!(await looksLikeCompany(dir))) continue;
      add(`${dir}\\`, install.dir, false, null);
    }
  }

  // Empresas declaradas a mano en el config, aunque su instalacion no las liste.
  for (const key of Object.keys(config.companies)) {
    if (await isDirectory(key.replace(/\\+$/, ''))) add(key, null, false, null);
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Convierte lo que escribio el usuario en una ruta de empresa.
 *
 * Acepta la ruta completa (`Z:\SIIWI01\`), solo el numero (`01`, `1`) o un alias
 * configurado. Si hay ambiguedad entre instalaciones lo dice en el error.
 */
export function resolveCompany(input: string, companies: Company[]): Company {
  const raw = input.trim();
  if (raw.length === 0) throw new Error('Debe indicar una empresa.');

  const byExactPath = companies.find((c) => c.path === companyKey(raw));
  if (byExactPath) return byExactPath;

  const byAlias = companies.filter((c) => c.alias && c.alias.toLowerCase() === raw.toLowerCase());
  if (byAlias.length === 1) return byAlias[0]!;
  if (byAlias.length > 1) {
    throw new Error(
      `El alias "${raw}" corresponde a varias empresas: ${byAlias.map((c) => c.path).join(', ')}. Indique la ruta completa.`,
    );
  }

  const numberMatch = /^(?:SIIWI)?(\d{1,2})$/i.exec(raw);
  if (numberMatch) {
    const num = numberMatch[1]!.padStart(2, '0');
    const matches = companies.filter((c) => c.number === num);
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) {
      throw new Error(
        `La empresa ${num} existe en varias unidades: ${matches.map((c) => c.path).join(', ')}. Indique la ruta completa.`,
      );
    }
  }

  const disponibles = companies.map((c) => (c.alias ? `${c.path} (${c.alias})` : c.path)).join(', ');
  throw new Error(`No se encontro la empresa "${input}". Empresas disponibles: ${disponibles || 'ninguna'}.`);
}

/** Instalacion que se usara para ejecutar contra una empresa dada. */
export function pickInstallation(company: Company, installations: Installation[], preferred?: string): Installation {
  if (installations.length === 0) {
    throw new Error(
      `No se encontro ninguna instalacion de SIIGO con ${EXE_NAME}. Agregue la ruta con la herramienta siigo_add_installation.`,
    );
  }

  if (preferred) {
    const wanted = preferred.replace(/\\+$/, '').toUpperCase();
    const match = installations.find((i) => i.dir.toUpperCase() === wanted);
    if (!match) {
      throw new Error(
        `La instalacion "${preferred}" no esta entre las detectadas: ${installations.map((i) => i.dir).join(', ')}.`,
      );
    }
    return match;
  }

  const linked = installations.find((i) => company.installations.includes(i.dir));
  return linked ?? installations[0]!;
}
