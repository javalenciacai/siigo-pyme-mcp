/**
 * Lectura de `<instalacion>\filepath.txt`.
 *
 * Formato observado: `Z:\SIIWI01\::\\127.0.0.1\inmunotek::`
 *   campo 0 — ruta de UNA empresa (la que sirve esa instalacion; NO es un indice de todas)
 *   campo 1 — UNC del servidor donde vive esa carpeta
 *   campo 2 — vacio
 *
 * El archivo viene en cp1252, no en UTF-8.
 */
import { readFile } from 'node:fs/promises';
import iconv from 'iconv-lite';

export interface FilePathInfo {
  /** Ruta de la empresa declarada, normalizada con backslash final. Ej: `Z:\SIIWI01\`. */
  companyPath: string;
  /** Numero de empresa extraido de `SIIWInn`. Ej: `01`. */
  companyNumber: string | null;
  /** UNC del servidor, si el archivo lo declara. */
  unc: string | null;
  /** Nombre del recurso compartido del UNC. Se usa como alias por defecto. */
  shareName: string | null;
  /** Contenido crudo, util para diagnosticar formatos inesperados. */
  raw: string;
}

export function parseFilePath(raw: string): FilePathInfo | null {
  const line = raw.replace(/\r?\n/g, '').trim();
  if (line.length === 0) return null;

  const fields = line.split('::');
  const first = (fields[0] ?? '').trim();
  if (first.length === 0) return null;

  const companyPath = first.endsWith('\\') ? first : `${first}\\`;
  const numberMatch = /SIIWI(\d+)/i.exec(companyPath);
  const unc = (fields[1] ?? '').trim() || null;
  const shareMatch = unc ? /^\\\\[^\\]+\\([^\\]+)/.exec(unc) : null;

  return {
    companyPath,
    companyNumber: numberMatch ? numberMatch[1]!.padStart(2, '0') : null,
    unc,
    shareName: shareMatch ? shareMatch[1]! : null,
    raw: line,
  };
}

export async function readFilePathTxt(path: string): Promise<FilePathInfo | null> {
  try {
    const buf = await readFile(path);
    return parseFilePath(iconv.decode(buf, 'win1252'));
  } catch {
    return null;
  }
}
