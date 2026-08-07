/**
 * Derivacion de los esquemas MCP a partir del catalogo.
 *
 * Cada funcion de `EXCELSIIGO.exe` se convierte en una herramienta cuyo esquema sale de
 * sus `ParamSpec`. La validacion fina (longitudes, ceros a la izquierda, rangos de fecha)
 * la sigue haciendo `siigo/args.ts`, que produce mensajes citando el nombre del manual;
 * aqui solo se declaran los tipos y las descripciones.
 */
import { z } from 'zod';
import { isRequired, type FunctionSpec, type ParamSpec } from '../catalog/types.js';
import { MAX_PATH_ARG } from '../siigo/args.js';

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

/**
 * Recordatorio del formato exacto que exige el CLI, derivado del tipo del parametro.
 *
 * Va en la descripcion del PARAMETRO y no en la de la herramienta a proposito: es ahi donde
 * mira el modelo al rellenar argumentos. Es la defensa util contra el 081, el codigo con el que
 * `EXCELSIIGO.exe` responde a un parametro mal formateado mientras termina con codigo 0, de
 * modo que un error de formato se presenta como un exito.
 */
export function formatoHint(p: ParamSpec): string {
  switch (p.type.kind) {
    case 'mmdd':
      return ' Formato MMDD (4 digitos); tambien acepta 2026-05-17 y 05-17.';
    case 'yyyymmdd':
      return ' Formato AAAAMMDD (8 digitos); tambien acepta 2026-05-17.';
    case 'digits':
      return ` Hasta ${p.type.len} digitos${p.type.pad ? ', rellenado con ceros a la izquierda' : ''}.`;
    case 'text':
      return ` Texto de hasta ${p.type.max} caracteres, sin espacios.`;
    case 'enum':
      return ` Valores admitidos: ${p.type.values.join(' | ')}.`;
    case 'outfile':
      return ` Ruta del .xlsx a generar; omitala y el servidor calcula una corta (limite ${MAX_PATH_ARG} caracteres).`;
    case 'infile':
      return ' Ruta de un .xlsx que ya existe.';
    case 'errlog':
      return ' Ruta del log de errores; omitala para que el servidor la calcule.';
  }
}

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

  const described = base.describe(`${p.description} (en el manual: ${p.cli}).${formatoHint(p)}`);
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

/**
 * Esquema de solo los parametros propios de una funcion.
 *
 * Lo usa el despachador `siigo_run_function`, que recibe los parametros en un objeto en vez de
 * como campos de primer nivel. Reutiliza `zodForParam`, asi que los mensajes de validacion son
 * los mismos que dan las herramientas dedicadas.
 */
export function paramsSchemaFor(fn: FunctionSpec): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};
  for (const p of fn.params) shape[p.name] = zodForParam(p);
  return z.object(shape);
}

/** Nombre de la herramienta MCP correspondiente a una funcion. Ej: `GETMOV` -> `siigo_getmov`. */
export function toolNameFor(fn: FunctionSpec): string {
  return `siigo_${fn.name.toLowerCase()}`;
}

export function descriptionFor(fn: FunctionSpec): string {
  const accion =
    fn.kind === 'export'
      ? 'Genera un archivo .xlsx y devuelve sus primeras filas ya parseadas.'
      : 'ESCRIBE en la contabilidad de la empresa y no se puede deshacer: confirme con el usuario antes de ejecutarla.';
  // Nombrar los obligatorios y apuntar al formato exacto cuesta ~70 caracteres por herramienta
  // y evita la clase de error que el CLI reporta como 081 saliendo con codigo 0.
  const obligatorios = fn.params.filter(isRequired).map((p) => p.name);
  const firma = obligatorios.length
    ? ` Obligatorios: ${obligatorios.join(', ')}. Formato exacto en siigo_describe_function("${fn.name}").`
    : '';
  const notas = fn.notes?.length ? ` ${fn.notes.join(' ')}` : '';
  return `${fn.title} (funcion ${fn.name} de SIIGO Pyme). ${accion}${firma}${notas}`;
}
