/**
 * Aritmetica del limite de 50 caracteres del CLI.
 *
 * `EXCELSIIGO.exe` trunca las rutas que pasan de `MAX_PATH_ARG`, y cuando lo hace no avisa:
 * simplemente no genera nada. Hoy eso solo revienta en tiempo de ejecucion. Aqui se convierte
 * en un chequeo previo, derivando del catalogo el nombre mas largo que el runner puede generar.
 */
import path from 'node:path';
import { FUNCTIONS } from '../catalog/functions.js';
import { MAX_PATH_ARG } from '../siigo/args.js';

/** Longitud del identificador corto que genera el runner (`nextRunId`, base36 de 4 caracteres). */
const RUN_ID_LEN = 4;

/**
 * Nombre de archivo mas largo que puede generar el runner.
 * Los patrones son los de `siigo/runner.ts`: `<FN>-<id>.xlsx` y `<FN>-<id>-err.xlsx`.
 */
export function longestGeneratedFileName(): { nombre: string; largo: number } {
  let mejor = '';
  for (const fn of FUNCTIONS) {
    const generaSalida = fn.params.some((p) => p.type.kind === 'outfile');
    const generaErrLog = fn.params.some((p) => p.type.kind === 'errlog');
    if (!generaSalida && !generaErrLog) continue;
    const id = 'z'.repeat(RUN_ID_LEN);
    const candidatos = [
      ...(generaSalida ? [`${fn.name}-${id}.xlsx`] : []),
      ...(generaErrLog ? [`${fn.name}-${id}-err.xlsx`] : []),
    ];
    for (const c of candidatos) if (c.length > mejor.length) mejor = c;
  }
  return { nombre: mejor, largo: mejor.length };
}

export interface Headroom {
  /** Longitud total de la ruta mas larga que se llegaria a construir. */
  largoMaximo: number;
  /** Caracteres que sobran respecto del limite. Negativo significa que no cabe. */
  margen: number;
  ok: boolean;
  limite: number;
}

/** Margen de la carpeta de salida frente al nombre generado mas largo. */
export function outputHeadroom(outputDir: string): Headroom & { archivoMasLargo: string } {
  const { nombre } = longestGeneratedFileName();
  const completo = path.join(outputDir, nombre);
  const largoMaximo = completo.length;
  return {
    archivoMasLargo: nombre,
    largoMaximo,
    margen: MAX_PATH_ARG - largoMaximo,
    ok: largoMaximo <= MAX_PATH_ARG,
    limite: MAX_PATH_ARG,
  };
}

/** Margen de la ruta del log, que el runner deja en `<empresa>\LOGS\mcpXXXX.log`. */
export function logPathHeadroom(companyPath: string): Headroom & { ruta: string } {
  const ruta = path.join(companyPath, 'LOGS', `mcp${'z'.repeat(RUN_ID_LEN)}.log`);
  return {
    ruta,
    largoMaximo: ruta.length,
    margen: MAX_PATH_ARG - ruta.length,
    ok: ruta.length <= MAX_PATH_ARG,
    limite: MAX_PATH_ARG,
  };
}
