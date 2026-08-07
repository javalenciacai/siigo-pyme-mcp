/**
 * Constructores de `ParamSpec` para los parametros que se repiten entre funciones.
 *
 * Las descripciones son traduccion directa del manual (`ExcelSIIGO-Ayuda.LOG`); llegan
 * tal cual al esquema MCP, asi que el agente ve la misma documentacion que un humano.
 */
import type { ParamSpec } from './types.js';

/** N digitos. `pad` rellena con ceros a la izquierda hasta `len`. */
export function digits(
  name: string,
  cli: string,
  len: number,
  opts: { pad?: boolean; default?: string; description?: string },
): ParamSpec {
  const spec: ParamSpec = {
    name,
    cli,
    type: { kind: 'digits', len, pad: opts.pad ?? false },
    description: opts.description ?? `${cli}: ${len} digitos.`,
  };
  if (opts.default !== undefined) spec.default = opts.default;
  return spec;
}

export const conDatos = (): ParamSpec => ({
  name: 'conDatos',
  cli: 'ConDatos',
  type: { kind: 'enum', values: ['S', 'N'] },
  default: 'S',
  description: 'S = tomar datos de SIIGO, N = generar solo el encabezado (plantilla vacia).',
});

export const fechaInicial = (): ParamSpec => ({
  name: 'fechaInicial',
  cli: 'FechaInicial',
  type: { kind: 'mmdd' },
  description: 'Fecha inicial dentro del anio de proceso, formato MMDD. Ej: 0517. Tambien acepta 2026-05-17.',
});

export const fechaFinal = (): ParamSpec => ({
  name: 'fechaFinal',
  cli: 'FechaFinal',
  type: { kind: 'mmdd' },
  description: 'Fecha final dentro del anio de proceso, formato MMDD. Ej: 0530. Tambien acepta 2026-05-30.',
});

export const tipoComprobante = (description: string): ParamSpec => ({
  name: 'tipoComprobante',
  cli: 'TipoComprobante',
  type: { kind: 'text', max: 1 },
  default: '*',
  description,
});

export const codigoComprobanteInicial = (): ParamSpec =>
  digits('codigoComprobanteInicial', 'CodigoComprobanteInicial', 3, {
    pad: true,
    default: '001',
    description: 'Codigo de comprobante inicial a exportar, 3 digitos. Ej: 001.',
  });

export const codigoComprobanteFinal = (): ParamSpec =>
  digits('codigoComprobanteFinal', 'CodigoComprobanteFinal', 3, {
    pad: true,
    default: '999',
    description: 'Codigo de comprobante final a exportar, 3 digitos. Ej: 002.',
  });

export const nroInicial = (): ParamSpec =>
  digits('nroInicial', 'NroInicial', 11, {
    pad: true,
    default: '00000000001',
    description: 'Numero de comprobante inicial, 11 digitos. Ej: 00000000001.',
  });

export const nroFinal = (): ParamSpec =>
  digits('nroFinal', 'NroFinal', 11, {
    pad: true,
    default: '99999999999',
    description: 'Numero de comprobante final, 11 digitos. Ej: 99999999999.',
  });

/** Rango de producto relleno con ceros (linea 3 + grupo 4 + producto 6). */
export const productoInicialPad = (def = '0000000000000'): ParamSpec =>
  digits('productoInicial', 'ProductoInicial', 13, {
    pad: true,
    default: def,
    description: 'Producto inicial, 13 digitos (linea 3 + grupo 4 + producto 6). Ej: 0010001000001.',
  });

export const productoFinalPad = (): ParamSpec =>
  digits('productoFinal', 'ProductoFinal', 13, {
    pad: true,
    default: '9999999999999',
    description: 'Producto final, 13 digitos (linea 3 + grupo 4 + producto 6). Ej: 9999999999999.',
  });

/** Rango de producto sin relleno: el manual documenta ejemplos como `10001000001`. */
export const productoInicialRaw = (): ParamSpec =>
  digits('productoInicial', 'ProductoInicial', 13, {
    default: '1',
    description: 'Producto inicial, hasta 13 digitos (linea 3 + grupo 4 + producto 6). Ej: 0010001000001.',
  });

export const productoFinalRaw = (): ParamSpec =>
  digits('productoFinal', 'ProductoFinal', 13, {
    default: '9999999999999',
    description: 'Producto final, hasta 13 digitos (linea 3 + grupo 4 + producto 6). Ej: 9999999999999.',
  });

export const terceroInicial = (): ParamSpec =>
  digits('terceroInicial', 'TerceroInicial', 13, {
    default: '1',
    description: 'Tercero (NIT) inicial, hasta 13 digitos. Ej: 1.',
  });

export const terceroFinal = (): ParamSpec =>
  digits('terceroFinal', 'TerceroFinal', 13, {
    default: '9999999999999',
    description: 'Tercero (NIT) final, hasta 13 digitos. Ej: 9999999999999.',
  });

export const cuentaInicial = (name = 'cuentaInicial', cli = 'CuentaInicial'): ParamSpec =>
  digits(name, cli, 10, {
    pad: true,
    default: '0000000000',
    description: `${cli}: cuenta contable inicial, 10 digitos. Ej: 1105050100.`,
  });

export const cuentaFinal = (name = 'cuentaFinal', cli = 'CuentaFinal'): ParamSpec =>
  digits(name, cli, 10, {
    pad: true,
    default: '9999999999',
    description: `${cli}: cuenta contable final, 10 digitos. Ej: 1110050100.`,
  });

export const bodegaInicial = (def = '0001'): ParamSpec =>
  digits('bodegaInicial', 'BodegaInicial', 4, {
    pad: true,
    default: def,
    description: 'Bodega inicial, 4 digitos. Ej: 0001.',
  });

export const bodegaFinal = (): ParamSpec =>
  digits('bodegaFinal', 'BodegaFinal', 4, {
    pad: true,
    default: '9999',
    description: 'Bodega final, 4 digitos. Ej: 9999.',
  });

export const estadoSerial = (): ParamSpec => ({
  name: 'estado',
  cli: 'Estado',
  type: { kind: 'enum', values: ['D', 'N', 'T'] },
  default: 'T',
  description: 'D = disponible, N = no disponible, T = todos.',
});

export const serialInicial = (): ParamSpec => ({
  name: 'serialInicial',
  cli: 'SerialInicial',
  type: { kind: 'text', max: 25 },
  default: '*',
  description: 'Serial inicial, hasta 25 caracteres. Ej: * (todos).',
});

export const serialFinal = (): ParamSpec => ({
  name: 'serialFinal',
  cli: 'SerialFinal',
  type: { kind: 'text', max: 25 },
  default: 'z'.repeat(25),
  description: 'Serial final, hasta 25 caracteres. Ej: zzzzzzzzzzzzzzzzzzzzzzzzz.',
});

export const centroCostoInicial = (def = '0000'): ParamSpec =>
  digits('centroCostoInicial', 'CentroCostoInicial', 4, {
    pad: true,
    default: def,
    description: 'Centro de costo inicial, 4 digitos. Ej: 0000.',
  });

export const centroCostoFinal = (): ParamSpec =>
  digits('centroCostoFinal', 'CentroCostoFinal', 4, {
    pad: true,
    default: '9999',
    description: 'Centro de costo final, 4 digitos. Ej: 9999.',
  });

export const subCentroCostoInicial = (): ParamSpec =>
  digits('subCentroCostoInicial', 'SubCentroCostoInicial', 3, {
    pad: true,
    default: '000',
    description: 'Subcentro de costo inicial, 3 digitos. Ej: 000.',
  });

export const subCentroCostoFinal = (): ParamSpec =>
  digits('subCentroCostoFinal', 'SubCentroCostoFinal', 3, {
    pad: true,
    default: '999',
    description: 'Subcentro de costo final, 3 digitos. Ej: 999.',
  });

export const archivoSalida = (ejemplo: string): ParamSpec => ({
  name: 'archivoSalida',
  cli: 'NombreArchivoExcelSalida',
  type: { kind: 'outfile' },
  default: '',
  description:
    `Ruta completa del .xlsx a generar, maximo 50 caracteres. Ej: ${ejemplo}. ` +
    'Si se omite, el servidor genera una ruta corta dentro de su carpeta de salida. ' +
    'Si se pasa un nombre sin ruta, SIIGO lo deja en la carpeta Documentos del usuario.',
});

export const archivoEntrada = (ejemplo: string): ParamSpec => ({
  name: 'archivoEntrada',
  cli: 'NombreArchivoExcelEntrada',
  type: { kind: 'infile' },
  description: `Ruta completa del .xlsx con la informacion a importar, maximo 50 caracteres. Ej: ${ejemplo}.`,
});

export const logErrores = (ejemplo: string): ParamSpec => ({
  name: 'logErrores',
  cli: 'Ruta\\nombrelogerrores',
  type: { kind: 'errlog' },
  default: '',
  description:
    `Ruta donde dejar el log de errores de la importacion. Ej: ${ejemplo}. ` +
    'Si se omite, el servidor genera una ruta corta.',
});

/** Los `PUSH*` sencillos comparten exactamente estos dos parametros. */
export function importParams(entrada: string, errores: string): ParamSpec[] {
  return [archivoEntrada(entrada), logErrores(errores)];
}

/** Nota que el manual repite en cada funcion de importacion. */
export const NOTA_TEMP =
  'El resultado de la importacion queda en la carpeta TEMP de la empresa correspondiente.';

/** Condiciones del modelo basico, repetidas en GETMOV/PUSHMOV. */
export const NOTAS_MODELO_BASICO = [
  'Modelo basico: no maneja multiples formas de pago.',
  'Modelo basico: solo se digitan productos en la interface.',
  'Modelo basico: no contempla activos fijos, moneda extranjera, AIU, seriales ni clasificaciones.',
];
