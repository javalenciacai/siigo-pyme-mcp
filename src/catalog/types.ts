/**
 * Modelo declarativo del CLI `EXCELSIIGO.exe`.
 *
 * Todo el conocimiento de la sintaxis posicional vive en `functions.ts`. El resto del
 * servidor (esquemas MCP, validacion, construccion del argv) se deriva de aqui, de modo
 * que agregar o corregir una funcion no toca codigo.
 *
 * Fuente de verdad: `<instalacion>\ExcelSIIGO-Ayuda.LOG`.
 */

/** Tipo de un parametro posicional, con las reglas de formato que exige el CLI. */
export type ParamType =
  /**
   * N digitos como maximo.
   *
   * `pad` se activa solo en los campos donde el propio manual muestra el valor relleno
   * con ceros (codigo de comprobante, numero de comprobante, cuenta, bodega, mes...).
   * En los campos donde el manual escribe `1` para un rango de 13 digitos se deja
   * `pad` en falso, porque rellenar cambiaria el argumento respecto de lo documentado.
   */
  | { kind: 'digits'; len: number; pad?: boolean }
  /** 4 digitos `MMDD`. Acepta tambien `2026-05-17` y `05-17`. */
  | { kind: 'mmdd' }
  /** 8 digitos `AAAAMMDD`. Acepta tambien `2026-05-17`. */
  | { kind: 'yyyymmdd' }
  /** Un unico caracter dentro de un conjunto cerrado. Ej: `S`/`N`. */
  | { kind: 'enum'; values: string[] }
  /** Texto libre con longitud maxima. */
  | { kind: 'text'; max: number }
  /** Ruta del `.xlsx` que genera el CLI. Si se omite se calcula una ruta corta. */
  | { kind: 'outfile' }
  /** Ruta del `.xlsx` de entrada. Debe existir. */
  | { kind: 'infile' }
  /** Ruta del log de errores de un `PUSH*`. Si se omite se calcula. */
  | { kind: 'errlog' };

export interface ParamSpec {
  /** Nombre camelCase expuesto en el esquema MCP. */
  name: string;
  /** Nombre tal cual aparece en el manual, usado en los mensajes de error. */
  cli: string;
  type: ParamType;
  /** Texto del manual; se usa como descripcion del campo en el esquema MCP. */
  description: string;
  /** Valor aplicado cuando el llamador no envia nada. Si falta, el parametro es obligatorio. */
  default?: string;
}

export type FunctionKind = 'export' | 'import';

export interface FunctionSpec {
  /** Nombre de la funcion tal cual lo espera el CLI. Ej: `GETMOV`. */
  name: string;
  kind: FunctionKind;
  /** Titulo del manual. Ej: `Extraer Movimiento Contable`. */
  title: string;
  /** Agrupacion del manual, para `siigo_list_functions`. */
  group: string;
  /** Parametros que siguen al prefijo comun, en ORDEN POSICIONAL. */
  params: ParamSpec[];
  /**
   * Linea `Ejemplo:` literal del manual. Es el oraculo de los tests dorados:
   * reconstruir el argv con estos valores debe reproducirla exactamente.
   */
  example: string;
  /**
   * Correccion de una errata del manual en la linea `Ejemplo:`. Cuando existe, los tests
   * dorados validan contra `line` en vez de `example`, y `reason` documenta por que.
   */
  exampleFix?: { reason: string; line: string };
  /** Notas del manual que conviene que el agente vea. */
  notes?: string[];
}

/** Un parametro obligatorio es el que no trae `default`. */
export function isRequired(p: ParamSpec): boolean {
  return p.default === undefined;
}
