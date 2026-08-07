/**
 * Derivacion de los esquemas MCP a partir del catalogo.
 *
 * Cada funcion de `EXCELSIIGO.exe` se convierte en una herramienta cuyo esquema sale de
 * sus `ParamSpec`. La validacion fina (longitudes, ceros a la izquierda, rangos de fecha)
 * la sigue haciendo `siigo/args.ts`, que produce mensajes citando el nombre del manual;
 * aqui solo se declaran los tipos y las descripciones.
 */
import { z } from 'zod';
import type { FunctionSpec, ParamSpec } from '../catalog/types.js';

/** Acepta texto o numero: los modelos suelen enviar `2026` en vez de `"2026"`. */
const escalar = z.union([z.string(), z.number()]);

/** Campos comunes a las 47 herramientas de funcion. */
export const commonInputs = {
  empresa: z
    .string()
    .describe(
      'Empresa sobre la que ejecutar. Acepta la ruta completa (Z:\\SIIWI01\\), solo el numero (01) '
      + 'o un alias configurado. Use siigo_list_companies para ver las disponibles.',
    ),
  anio: escalar
    .optional()
    .describe('Anio de proceso en SIIGO, 4 digitos. Por defecto el anio configurado para la empresa o el actual.'),
  norma: z
    .enum(['L', 'N'])
    .optional()
    .describe('Norma de la que se extrae la informacion: L = local (PUC colombiano), N = NIIF. Por defecto L.'),
  instalacion: z
    .string()
    .optional()
    .describe('Carpeta de la instalacion de SIIGO a usar (por ejemplo C:\\Siigo2). Por defecto la asociada a la empresa.'),
  usuario: z
    .string()
    .optional()
    .describe('Usuario de SIIGO, hasta 8 caracteres. Por defecto el configurado para la empresa.'),
  clave: z
    .string()
    .optional()
    .describe('Clave del usuario, hasta 8 caracteres. Por defecto la configurada. Nunca se devuelve en las respuestas.'),
};

/** Campos extra que solo tienen sentido en las funciones de exportacion. */
export const exportInputs = {
  filasPreview: z
    .number()
    .int()
    .min(0)
    .max(500)
    .optional()
    .describe('Cuantas filas del xlsx generado incluir en la respuesta. Por defecto 50; use 0 para no leer el archivo.'),
};

function zodForParam(p: ParamSpec): z.ZodTypeAny {
  let base: z.ZodTypeAny;

  switch (p.type.kind) {
    case 'enum': {
      const values = p.type.values as [string, ...string[]];
      base = z.enum(values);
      break;
    }
    case 'digits':
    case 'mmdd':
    case 'yyyymmdd':
      base = escalar;
      break;
    default:
      base = z.string();
  }

  const described = base.describe(p.description);
  // Un parametro con default declarado es opcional para el llamador; el default se aplica
  // en buildArgv, no aqui, para que el catalogo siga siendo la unica fuente de verdad.
  return p.default === undefined ? described : described.optional();
}

export function inputSchemaFor(fn: FunctionSpec): z.ZodRawShape {
  const shape: z.ZodRawShape = { ...commonInputs };
  if (fn.kind === 'export') Object.assign(shape, exportInputs);
  for (const p of fn.params) shape[p.name] = zodForParam(p);
  return shape;
}

/** Nombre de la herramienta MCP correspondiente a una funcion. Ej: `GETMOV` -> `siigo_getmov`. */
export function toolNameFor(fn: FunctionSpec): string {
  return `siigo_${fn.name.toLowerCase()}`;
}

export function descriptionFor(fn: FunctionSpec): string {
  const accion =
    fn.kind === 'export'
      ? 'Genera un archivo .xlsx y devuelve sus primeras filas ya parseadas.'
      : 'Importa a SIIGO el contenido de un archivo .xlsx.';
  const notas = fn.notes?.length ? ` ${fn.notes.join(' ')}` : '';
  return `${fn.title} (funcion ${fn.name} de SIIGO Pyme). ${accion}${notas}`;
}
