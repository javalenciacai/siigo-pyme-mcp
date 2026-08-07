/**
 * Las 47 funciones de `EXCELSIIGO.exe`, transcritas de `ExcelSIIGO-Ayuda.LOG`.
 *
 * El orden de `params` ES el orden posicional que espera el CLI. Alterarlo produce el
 * error `081 Parametros de la funcion GET tienen errores`, que el binario reporta con
 * codigo de salida 0 (es decir, en silencio). Por eso cada entrada guarda la linea
 * `Ejemplo:` del manual: `functions.golden.test.ts` reconstruye el argv con esos valores
 * y exige que coincida caracter por caracter.
 */
import type { FunctionSpec, ParamSpec } from './types.js';
import {
  NOTA_TEMP,
  NOTAS_MODELO_BASICO,
  archivoEntrada,
  archivoSalida,
  bodegaFinal,
  bodegaInicial,
  centroCostoFinal,
  centroCostoInicial,
  codigoComprobanteFinal,
  codigoComprobanteInicial,
  conDatos,
  cuentaFinal,
  cuentaInicial,
  digits,
  estadoSerial,
  fechaFinal,
  fechaInicial,
  importParams,
  logErrores,
  nroFinal,
  nroInicial,
  productoFinalPad,
  productoFinalRaw,
  productoInicialPad,
  productoInicialRaw,
  serialFinal,
  serialInicial,
  subCentroCostoFinal,
  subCentroCostoInicial,
  terceroFinal,
  terceroInicial,
  tipoComprobante,
} from './params.js';

const TIPO_COMPROBANTE_CONTABLE =
  'Tipo de comprobante: * = todos, F = facturas, etc. Un solo caracter.';
const TIPO_COMPROBANTE_EXTRA =
  'Tipo de comprobante: * = todos, Z = orden de pedido, Y = orden de compra, V = cotizacion.';

/** Parametros de GETMOV y GETMVT, identicos entre si. */
function movimientoParams(ejemploSalida: string): ParamSpec[] {
  return [
    conDatos(),
    fechaInicial(),
    fechaFinal(),
    tipoComprobante(TIPO_COMPROBANTE_CONTABLE),
    codigoComprobanteInicial(),
    codigoComprobanteFinal(),
    nroInicial(),
    nroFinal(),
    archivoSalida(ejemploSalida),
    {
      name: 'modeloBasico',
      cli: 'ModeloBasico',
      type: { kind: 'enum', values: ['S', 'N'] },
      default: 'N',
      description: 'N = exporta toda la informacion solicitada. S = genera el modelo basico.',
    },
    cuentaInicial(),
    cuentaFinal(),
    productoInicialPad(),
    productoFinalPad(),
  ];
}

export const FUNCTIONS: FunctionSpec[] = [
  // ── Movimiento contable ───────────────────────────────────────────────────
  {
    name: 'GETMOV',
    kind: 'export',
    title: 'Extraer Movimiento Contable',
    group: 'Movimiento contable',
    params: movimientoParams('C:\\SIIWI01\\MovimientoContable.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETMOV L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 0517 0531 F 001 002 00000000001 99999999999 C:\\SIIWI01\\MovimientoContable.xlsx N 1105050100 1110050100 0020001000523 0020001999999',
    notes: NOTAS_MODELO_BASICO,
  },
  {
    name: 'PUSHMOV',
    kind: 'import',
    title: 'Importar Movimiento Contable a SIIGO',
    group: 'Movimiento contable',
    params: [
      archivoEntrada('C:\\SIIWI01\\MovimientoContable.xlsx'),
      {
        name: 'modificaDocumentos',
        cli: 'ModificaDocumentos',
        type: { kind: 'enum', values: ['S', 'N'] },
        default: 'N',
        description: 'S = reemplaza documentos existentes. N = no permite modificarlos.',
      },
      {
        name: 'facturaBasica',
        cli: 'FacturaBasica',
        type: { kind: 'enum', values: ['S', 'N'] },
        default: 'N',
        description:
          'S = genera la factura a partir del producto facturado. N = sube el documento tal como esta en el excel.',
      },
      logErrores('C:\\SIIWI01\\LOGS\\ErrorMov.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHMOV L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\MovimientoContable.xlsx N N C:\\SIIWI01\\LOGS\\ErrorMov.xlsx',
    notes: [NOTA_TEMP, ...NOTAS_MODELO_BASICO],
  },
  {
    name: 'GETMVT',
    kind: 'export',
    title: 'Extraer Movimiento Contable de Cajero',
    group: 'Movimiento contable',
    params: movimientoParams('C:\\SIIWI01\\MovimientoContableCajero.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETMVT L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 0517 0531 F 001 002 00000000001 99999999999 C:\\SIIWI01\\MovimientoContableCajero.xlsx N 1105050100 1110050100 0020001000523 0020001999999',
  },

  // ── Terceros ──────────────────────────────────────────────────────────────
  {
    name: 'GETTER',
    kind: 'export',
    title: 'Extraer Terceros',
    group: 'Terceros',
    params: [
      conDatos(),
      terceroInicial(),
      terceroFinal(),
      archivoSalida('C:\\SIIWI01\\Terceros.xlsx'),
      {
        name: 'clasificacion',
        cli: 'Clasificacion',
        type: { kind: 'enum', values: ['T', 'C', 'P', 'O'] },
        default: 'T',
        description: 'T = todos, C = clientes, P = proveedores, O = otros.',
      },
      digits('desdeFechaApertura', 'DesdeFechaApertura', 8, {
        default: '0',
        description: 'Fecha de apertura desde, 8 digitos AAAAMMDD. Ej: 20190101. Use 0 para no filtrar.',
      }),
      digits('hastaFechaApertura', 'HastaFechaApertura', 8, {
        default: '99999999',
        description: 'Fecha de apertura hasta, 8 digitos AAAAMMDD. Ej: 20191231. Use 99999999 para no filtrar.',
      }),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETTER L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 1 9999999999999 C:\\SIIWI01\\Terceros.xlsx T 20190101 20191231',
  },
  {
    name: 'PUSHTER',
    kind: 'import',
    title: 'Importar Terceros a SIIGO',
    group: 'Terceros',
    params: importParams('C:\\SIIWI01\\Terceros.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorTer.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHTER L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\Terceros.xlsx C:\\SIIWI01\\LOGS\\ErrorTer.xlsx',
    notes: [NOTA_TEMP],
  },

  // ── Activos fijos ─────────────────────────────────────────────────────────
  {
    name: 'GETGRA',
    kind: 'export',
    title: 'Extraer Grupos de Activos',
    group: 'Activos fijos',
    params: [
      conDatos(),
      digits('grupoInicial', 'GrupoInicial', 4, { default: '1', description: 'Grupo de activos inicial, hasta 4 digitos. Ej: 1.' }),
      digits('grupoFinal', 'GrupoFinal', 4, { default: '9999', description: 'Grupo de activos final, hasta 4 digitos. Ej: 9999.' }),
      archivoSalida('C:\\SIIWI01\\GruposActivos.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETGRA L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 1 9999 C:\\SIIWI01\\GruposActivos.xlsx',
  },
  {
    name: 'PUSHGRA',
    kind: 'import',
    title: 'Importar Grupos de Activos a SIIGO',
    group: 'Activos fijos',
    params: importParams('C:\\SIIWI01\\GruposActivos.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorGrA.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHGRA L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\GruposActivos.xlsx C:\\SIIWI01\\LOGS\\ErrorGrA.xlsx',
    notes: [NOTA_TEMP],
  },
  {
    name: 'GETACT',
    kind: 'export',
    title: 'Extraer Activos',
    group: 'Activos fijos',
    params: [
      conDatos(),
      digits('activoInicial', 'ActivoInicial', 9, { default: '1', description: 'Activo inicial, hasta 9 digitos. Ej: 1.' }),
      digits('activoFinal', 'ActivoFinal', 9, { default: '999999999', description: 'Activo final, hasta 9 digitos. Ej: 999999999.' }),
      archivoSalida('C:\\SIIWI01\\Activos.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETACT L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 1 999999999 C:\\SIIWI01\\Activos.xlsx',
  },
  {
    name: 'PUSHACT',
    kind: 'import',
    title: 'Importar Activos a SIIGO',
    group: 'Activos fijos',
    params: importParams('C:\\SIIWI01\\Activos.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorAct.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHACT L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\Activos.xlsx C:\\SIIWI01\\LOGS\\ErrorAct.xlsx',
    notes: [NOTA_TEMP],
  },

  // ── Documentos extracontables ─────────────────────────────────────────────
  {
    name: 'GETEXT',
    kind: 'export',
    title: 'Extraer Documentos ExtraContables',
    group: 'Documentos extracontables',
    params: [
      conDatos(),
      fechaInicial(),
      fechaFinal(),
      tipoComprobante(TIPO_COMPROBANTE_EXTRA),
      codigoComprobanteInicial(),
      codigoComprobanteFinal(),
      nroInicial(),
      nroFinal(),
      archivoSalida('C:\\SIIWI01\\DocExtraContable.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETEXT L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 0417 0431 V 001 001 00000000001 99999999999 C:\\SIIWI01\\DocExtraContable.xlsx',
  },
  {
    name: 'PUSHEXT',
    kind: 'import',
    title: 'Importar Documentos ExtraContables a SIIGO',
    group: 'Documentos extracontables',
    params: importParams('C:\\SIIWI01\\DocExtraContable.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorExtracontables.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHEXT L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\DocExtraContable.xlsx C:\\SIIWI01\\LOGS\\ErrorExtracontables.xlsx',
    notes: [NOTA_TEMP],
  },

  // ── Inventarios ───────────────────────────────────────────────────────────
  {
    name: 'GETLIN',
    kind: 'export',
    title: 'Extraer Lineas y grupos de Inventarios',
    group: 'Inventarios',
    params: [
      conDatos(),
      digits('lineaGrupoInicial', 'LineaGrupoInicial', 7, {
        default: '1',
        description: 'Linea + grupo inicial, hasta 7 digitos (linea 3 + grupo 4). Ej: 0010001.',
      }),
      digits('lineaGrupoFinal', 'LineaGrupoFinal', 7, {
        default: '9999999',
        description: 'Linea + grupo final, hasta 7 digitos (linea 3 + grupo 4). Ej: 9999999.',
      }),
      archivoSalida('C:\\SIIWI01\\LineasGruposInv.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETLIN L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 10001 9999999 C:\\SIIWI01\\LineasGruposInv.xlsx',
  },
  {
    name: 'PUSHLIN',
    kind: 'import',
    title: 'Importar Lineas y grupos de inventario a SIIGO',
    group: 'Inventarios',
    params: importParams('C:\\SIIWI01\\LineasGruposInv.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorLinInv.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHLIN L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\LineasGruposInv.xlsx C:\\SIIWI01\\LOGS\\ErrorLinInv.xlsx',
    notes: [NOTA_TEMP],
  },
  {
    name: 'GETINV',
    kind: 'export',
    title: 'Extraer Productos de Inventarios',
    group: 'Inventarios',
    params: [conDatos(), productoInicialRaw(), productoFinalRaw(), archivoSalida('C:\\SIIWI01\\Productos.xlsx')],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETINV L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 10001000001 9999999999999 C:\\SIIWI01\\Productos.xlsx',
  },
  {
    name: 'PUSHINV',
    kind: 'import',
    title: 'Importar Productos a SIIGO',
    group: 'Inventarios',
    params: importParams('C:\\SIIWI01\\Productos.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorInventarios.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHINV L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\Productos.xlsx C:\\SIIWI01\\LOGS\\ErrorInventarios.xlsx',
    notes: [NOTA_TEMP],
  },
  {
    name: 'GETLIS',
    kind: 'export',
    title: 'Extraer Listas de Precio por producto',
    group: 'Inventarios',
    params: [
      conDatos(),
      productoInicialRaw(),
      productoFinalRaw(),
      archivoSalida('C:\\SIIWI01\\ListasPrecio.xlsx'),
      digits('codigoMoneda', 'CodigoMoneda', 2, { pad: true, default: '00', description: 'Codigo de moneda, 2 digitos. Ej: 00.' }),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETLIS L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 10001000001 9999999999999 C:\\SIIWI01\\ListasPrecio.xlsx 00',
  },
  {
    name: 'PUSHLIS',
    kind: 'import',
    title: 'Importar Listas de Precio productos a SIIGO',
    group: 'Inventarios',
    params: importParams('C:\\SIIWI01\\ListasPrecio.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorLis.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHLIS L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\ListasPrecio.xlsx C:\\SIIWI01\\LOGS\\ErrorLis.xlsx',
    notes: [NOTA_TEMP],
  },
  {
    name: 'GETKIT',
    kind: 'export',
    title: 'Extraer Formulacion de Productos (kits)',
    group: 'Inventarios',
    params: [conDatos(), productoInicialRaw(), productoFinalRaw(), archivoSalida('C:\\SIIWI01\\Kits.xlsx')],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETKIT L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 10001000001 9999999999999 C:\\SIIWI01\\Kits.xlsx',
  },
  {
    name: 'PUSHKIT',
    kind: 'import',
    title: 'Importar Formulacion de Productos (kits)',
    group: 'Inventarios',
    params: importParams('C:\\SIIWI01\\Kits.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorKits.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHKIT L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\Kits.xlsx C:\\SIIWI01\\LOGS\\ErrorKits.xlsx',
    notes: [NOTA_TEMP],
  },
  {
    name: 'GETPRE',
    kind: 'export',
    title: 'Extraer Formulacion Presupuesto de venta',
    group: 'Inventarios',
    params: [conDatos(), productoInicialRaw(), productoFinalRaw(), archivoSalida('C:\\SIIWI01\\PresupuestoVta.xlsx')],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETPRE L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 10001000001 9999999999999 C:\\SIIWI01\\PresupuestoVta.xlsx',
  },
  {
    name: 'PUSHPRE',
    kind: 'import',
    title: 'Importar Formulacion Presupuesto de venta',
    group: 'Inventarios',
    params: importParams('C:\\SIIWI01\\PresupuestoVta.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorPresupuesto.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHPRE L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\PresupuestoVta.xlsx C:\\SIIWI01\\LOGS\\ErrorPresupuesto.xlsx',
    notes: [NOTA_TEMP],
  },

  // ── Contabilidad ──────────────────────────────────────────────────────────
  {
    name: 'GETCTA',
    kind: 'export',
    title: 'Extraer Cuentas Contables',
    group: 'Contabilidad',
    params: [conDatos(), cuentaInicial(), cuentaFinal(), archivoSalida('C:\\SIIWI01\\CuentasContables.xlsx')],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETCTA L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 1105050100 1110050500 C:\\SIIWI01\\CuentasContables.xlsx',
  },
  {
    name: 'PUSHCTA',
    kind: 'import',
    title: 'Importar Cuentas Contables a SIIGO',
    group: 'Contabilidad',
    params: importParams('C:\\SIIWI01\\CuentasContables.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorCuentas.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHCTA L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\CuentasContables.xlsx C:\\SIIWI01\\LOGS\\ErrorCuentas.xlsx',
    notes: [NOTA_TEMP],
  },
  {
    name: 'GETMUL',
    kind: 'export',
    title: 'Extraer Definicion cuentas para multiples retenciones',
    group: 'Contabilidad',
    params: [
      conDatos(),
      cuentaInicial('cuentaPrincipalInicial', 'CuentaPrincipalInicial'),
      cuentaFinal('cuentaPrincipalFinal', 'CuentaPrincipalFinal'),
      archivoSalida('C:\\SIIWI01\\CuentasRetenciones.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETMUL L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 1105050100 1110050500 C:\\SIIWI01\\CuentasRetenciones.xlsx',
  },
  {
    name: 'PUSHMUL',
    kind: 'import',
    title: 'Importar Definicion cuentas para multiples retenciones a SIIGO',
    group: 'Contabilidad',
    params: importParams('C:\\SIIWI01\\CuentasRetenciones.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorMultRet.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHMUL L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\CuentasRetenciones.xlsx C:\\SIIWI01\\LOGS\\ErrorMultRet.xlsx',
    notes: [NOTA_TEMP],
  },
  {
    name: 'GETICA',
    kind: 'export',
    title: 'Extraer Actividades economicas (ICA)',
    group: 'Contabilidad',
    params: [
      conDatos(),
      digits('actividadEconomicaInicial', 'ActividadEconomicaInicial', 5, {
        default: '1',
        description: 'Actividad economica inicial, hasta 5 digitos. Ej: 1.',
      }),
      digits('actividadEconomicaFinal', 'ActividadEconomicaFinal', 5, {
        default: '99999',
        description: 'Actividad economica final, hasta 5 digitos. Ej: 99999.',
      }),
      archivoSalida('C:\\SIIWI01\\Actividades.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETICA L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 1 99999 C:\\SIIWI01\\Actividades.xlsx',
  },
  {
    name: 'PUSHICA',
    kind: 'import',
    title: 'Importar Actividades economicas (ICA)',
    group: 'Contabilidad',
    params: importParams('C:\\SIIWI01\\Actividades.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorICA.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHICA L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\Actividades.xlsx C:\\SIIWI01\\LOGS\\ErrorICA.xlsx',
    notes: [NOTA_TEMP],
  },

  // ── Otras interfaces ──────────────────────────────────────────────────────
  {
    name: 'GETBOD',
    kind: 'export',
    title: 'Extraer Saldos de Bodegas',
    group: 'Otras interfaces',
    params: [
      conDatos(),
      productoInicialPad('0010001000001'),
      productoFinalPad(),
      bodegaInicial(),
      bodegaFinal(),
      digits('mesDeCorte', 'MesdeCorte', 2, { pad: true, default: '12', description: 'Mes de corte, 2 digitos. Ej: 01.' }),
      archivoSalida('C:\\SIIWI01\\SaldosPorBodega.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETBOD L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 0010001000001 9999999999999 0001 9999 12 C:\\SIIWI01\\SaldosPorBodega.xlsx',
  },
  {
    name: 'GETBOP',
    kind: 'export',
    title: 'Extraer Saldos de Bodegas para Clasificaciones',
    group: 'Otras interfaces',
    params: [
      conDatos(),
      productoInicialPad('0010001000001'),
      productoFinalPad(),
      bodegaInicial(),
      bodegaFinal(),
      digits('mesDeCorte', 'MesdeCorte', 2, { pad: true, default: '12', description: 'Mes de corte, 2 digitos. Ej: 01.' }),
      archivoSalida('C:\\SIIWI01\\SaldosClaPorBodega.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETBOP L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 0010001000001 9999999999999 0001 9999 12 C:\\SIIWI01\\SaldosClaPorBodega.xlsx',
  },
  {
    name: 'GETBODM',
    kind: 'export',
    title: 'Extraer Maximos y Minimos por Bodegas',
    group: 'Otras interfaces',
    params: [
      conDatos(),
      productoInicialPad('0010001000001'),
      productoFinalPad(),
      bodegaInicial(),
      bodegaFinal(),
      archivoSalida('C:\\SIIWI01\\maximos_y_minimos_por_bodega.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETBODM L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 0010001000001 9999999999999 0001 9999 C:\\SIIWI01\\máximos_y_mínimos_por_bodega.xlsx',
  },
  {
    name: 'PUSHBODM',
    kind: 'import',
    title: 'Importar Maximos y Minimos por Bodega a SIIGO',
    group: 'Otras interfaces',
    params: importParams('C:\\SIIWI01\\maximos_y_minimos_por_bodega.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorBodMaxMin.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHBODM L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\máximos_y_mínimos_por_bodega.xlsx C:\\SIIWI01\\LOGS\\ErrorBodMaxMin.xlsx',
    notes: [NOTA_TEMP],
  },
  {
    name: 'GETSAL',
    kind: 'export',
    title: 'Extraer Saldos Cuentas por Cobrar o Cuentas por Pagar',
    group: 'Otras interfaces',
    params: [
      conDatos(),
      terceroInicial(),
      terceroFinal(),
      cuentaInicial(),
      cuentaFinal(),
      {
        name: 'saldoCuentas',
        cli: 'SaldoCuentas',
        type: { kind: 'enum', values: ['*', 'C', 'P'] },
        default: '*',
        description: '* = todos, C = cuentas por cobrar, P = cuentas por pagar.',
      },
      archivoSalida('C:\\SIIWI01\\SaldosCartera.xlsx'),
      {
        name: 'aCorteAnterior',
        cli: 'ACorteAnterior',
        type: { kind: 'enum', values: ['S', 'N'] },
        default: 'N',
        description: 'S = genera saldos a corte anterior, N = no los genera.',
      },
      {
        name: 'fechaCorte',
        cli: 'FechaCorte',
        type: { kind: 'mmdd' },
        default: '1231',
        description: 'Fecha de corte dentro del anio de proceso, formato MMDD. Ej: 0530.',
      },
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETSAL L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 1 9999999999999 1305050100 1305059900 C C:\\SIIWI01\\SaldosCartera.xlsx S 0530',
  },
  {
    name: 'GETCIU',
    kind: 'export',
    title: 'Extraer informacion de Paises y Ciudades',
    group: 'Otras interfaces',
    params: [
      conDatos(),
      digits('paisInicial', 'PaisInicial', 3, { pad: true, default: '001', description: 'Pais inicial, 3 digitos. Ej: 001.' }),
      digits('paisFinal', 'PaisFinal', 3, { pad: true, default: '999', description: 'Pais final, 3 digitos. Ej: 999.' }),
      digits('ciudadInicial', 'CiudadInicial', 4, { pad: true, default: '0001', description: 'Ciudad inicial, 4 digitos. Ej: 0001.' }),
      digits('ciudadFinal', 'CiudadFinal', 4, { pad: true, default: '9999', description: 'Ciudad final, 4 digitos. Ej: 9999.' }),
      archivoSalida('C:\\SIIWI01\\Ciudades.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2022 GETCIU L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 001 999 0001 9999 C:\\SIIWI01\\Ciudades.xlsx',
  },
  {
    name: 'GETVEN',
    kind: 'export',
    title: 'Extraer informacion de vendedores',
    group: 'Otras interfaces',
    params: [
      conDatos(),
      digits('vendedorInicial', 'VendedorInicial', 4, { pad: true, default: '0001', description: 'Vendedor inicial, 4 digitos. Ej: 0001.' }),
      digits('vendedorFinal', 'VendedorFinal', 4, { pad: true, default: '9999', description: 'Vendedor final, 4 digitos. Ej: 9999.' }),
      archivoSalida('C:\\SIIWI01\\Vendedores.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETVEN L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 0001 9999 C:\\SIIWI01\\Vendedores.xlsx',
  },
  {
    name: 'PUSHVEN',
    kind: 'import',
    title: 'Importar Catalogo de vendedores a SIIGO',
    group: 'Otras interfaces',
    params: importParams('C:\\SIIWI01\\Vendedores.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorVen.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHVEN L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\vendedores.xlsx C:\\SIIWI01\\LOGS\\ErrorVen.xlsx',
    notes: [NOTA_TEMP],
  },
  {
    name: 'GETCOS',
    kind: 'export',
    title: 'Extraer informacion de centros de costo',
    group: 'Otras interfaces',
    params: [
      conDatos(),
      centroCostoInicial(),
      centroCostoFinal(),
      subCentroCostoInicial(),
      subCentroCostoFinal(),
      archivoSalida('C:\\SIIWI01\\CentroCostos.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETCOS L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 0000 9999 000 999 C:\\SIIWI01\\CentroCostos.xlsx',
  },
  {
    name: 'PUSHCOS',
    kind: 'import',
    title: 'Importar Catalogo de centros de costo a SIIGO',
    group: 'Otras interfaces',
    params: importParams('C:\\SIIWI01\\CentroCostos.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorCos.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 PUSHCOS L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\CentroCostos.xlsx C:\\SIIWI01\\LOGS\\ErrorCos.xlsx',
    notes: [NOTA_TEMP],
  },
  {
    name: 'GETTBO',
    kind: 'export',
    title: 'Extraer informacion de Bodegas',
    group: 'Otras interfaces',
    params: [
      conDatos(),
      bodegaInicial('0000'),
      bodegaFinal(),
      digits('ubicacionInicial', 'UbicacionInicial', 3, { pad: true, default: '000', description: 'Ubicacion inicial, 3 digitos. Ej: 000.' }),
      digits('ubicacionFinal', 'UbicacionFinal', 3, { pad: true, default: '999', description: 'Ubicacion final, 3 digitos. Ej: 999.' }),
      archivoSalida('C:\\SIIWI01\\Bodegas.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2022 GETTBO L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 0000 9999 000 999 C:\\SIIWI01\\Bodegas.xlsx',
  },
  {
    name: 'PUSHTBO',
    kind: 'import',
    title: 'Importar Catalogo de bodegas a SIIGO',
    group: 'Otras interfaces',
    params: importParams('C:\\SIIWI01\\Bodegas.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorBodegas.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2022 PUSHTBO L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\Bodegas.xlsx C:\\SIIWI01\\LOGS\\ErrorBodegas.xlsx',
    notes: [NOTA_TEMP],
  },

  // ── Seriales ──────────────────────────────────────────────────────────────
  {
    name: 'GETSRL',
    kind: 'export',
    title: 'Extraer Maestro de Seriales',
    group: 'Seriales',
    params: [
      conDatos(),
      serialInicial(),
      serialFinal(),
      productoInicialPad('0010001000001'),
      productoFinalPad(),
      estadoSerial(),
      archivoSalida('C:\\SIIWI01\\MaestroSeriales.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETSRL L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S * zzzzzzzzzzzzzzzzzzzzzzzzz0010001000001 9999999999999 T C:\\SIIWI01\\MaestroSeriales.xlsx',
    exampleFix: {
      reason:
        'El manual pega SerialFinal con ProductoInicial (zzz...zzz0010001000001) por una errata de composicion; separados son dos argumentos.',
      line: 'ExcelSIIGO C:\\SIIWI01\\ 2018 GETSRL L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S * zzzzzzzzzzzzzzzzzzzzzzzzz 0010001000001 9999999999999 T C:\\SIIWI01\\MaestroSeriales.xlsx',
    },
  },
  {
    name: 'GETMSRL',
    kind: 'export',
    title: 'Extraer Movimiento de Seriales',
    group: 'Seriales',
    params: [
      conDatos(),
      fechaInicial(),
      fechaFinal(),
      tipoComprobante(TIPO_COMPROBANTE_CONTABLE),
      codigoComprobanteInicial(),
      codigoComprobanteFinal(),
      nroInicial(),
      nroFinal(),
      productoInicialPad(),
      productoFinalPad(),
      terceroInicial(),
      terceroFinal(),
      archivoSalida('C:\\SIIWI01\\MovimientoSeriales.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETMSRL L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 0501 0531 F 001 002 00000000001 99999999999  0020001000523 0020001999999 1 9999999999999 C:\\SIIWI01\\MovimientoSeriales.xlsx',
  },
  {
    name: 'GETBSRL',
    kind: 'export',
    title: 'Extraer Seriales por Bodega',
    group: 'Seriales',
    params: [
      conDatos(),
      serialInicial(),
      serialFinal(),
      productoInicialPad('0010001000001'),
      productoFinalPad(),
      bodegaInicial('0000'),
      bodegaFinal(),
      estadoSerial(),
      archivoSalida('C:\\SIIWI01\\SerialesBodega.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2018 GETBSRL L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log S * zzzzzzzzzzzzzzzzzzzzzzzzz 0010001000001 9999999999999 0000 9999 T C:\\SIIWI01\\SerialesBodega.xlsx',
  },

  // ── Historico de novedades ────────────────────────────────────────────────
  {
    name: 'GETHN',
    kind: 'export',
    title: 'Extraer Historico de novedades',
    group: 'Nomina',
    params: [
      {
        name: 'tipoNovedad',
        cli: 'TipoNovedad',
        type: { kind: 'enum', values: ['CC', 'VA', 'SU'] },
        description: 'CC = cambio de centro de costo, VA = vacaciones, SU = cambio de sueldo.',
      },
      {
        name: 'modelo',
        cli: 'Modelo',
        type: { kind: 'text', max: 10 },
        description:
          'Modelo definido previamente en Recursos Humanos > Interfases > Exportacion > Definicion de Modelos.',
      },
      centroCostoInicial(),
      centroCostoFinal(),
      subCentroCostoInicial(),
      subCentroCostoFinal(),
      terceroInicial(),
      terceroFinal(),
      fechaInicial(),
      fechaFinal(),
      digits('cargoInicial', 'CargoInicial', 4, { default: '0', description: 'Cargo inicial, hasta 4 digitos. Ej: 0001.' }),
      digits('cargoFinal', 'CargoFinal', 4, { default: '9999', description: 'Cargo final, hasta 4 digitos. Ej: 9999.' }),
      archivoSalida('C:\\SIIWI01\\novnomina.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2019 GETHN L ADMON 1111 C:\\SIIWI01\\LOGS\\ExcelSiigo.log CC 1 0000 9999 000 999 1 9999999999999 0101 1231 0 999 C:\\SIIWI01\\novnomina.xlsx',
  },

  // ── Empleados ─────────────────────────────────────────────────────────────
  {
    name: 'GETEMPL',
    kind: 'export',
    title: 'Extraer empleados',
    group: 'Nomina',
    params: [
      conDatos(),
      digits('empleadoInicial', 'EmpleadoInicial', 13, { default: '1', description: 'Empleado inicial, hasta 13 digitos. Ej: 1.' }),
      digits('empleadoFinal', 'EmpleadoFinal', 13, { default: '9999999999999', description: 'Empleado final, hasta 13 digitos. Ej: 9999999999999.' }),
      {
        name: 'fechaAperturaInicial',
        cli: 'FechaAperturaInicial',
        type: { kind: 'yyyymmdd' },
        default: '00000000',
        description: 'Fecha de apertura inicial, 8 digitos AAAAMMDD. Ej: 20210517. Tambien acepta 2021-05-17.',
      },
      {
        name: 'fechaAperturaFinal',
        cli: 'FechaAperturaFinal',
        type: { kind: 'yyyymmdd' },
        default: '99999999',
        description: 'Fecha de apertura final, 8 digitos AAAAMMDD. Ej: 20210530. Tambien acepta 2021-05-30.',
      },
      {
        name: 'incluyeRetirados',
        cli: 'IncluyeRetirados',
        type: { kind: 'enum', values: ['S', 'N'] },
        default: 'S',
        description: 'S = incluye retirados, N = no los incluye.',
      },
      archivoSalida('C:\\SIIWI01\\Empleados.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2022 GETEMPL L ADMON 1111 C:\\SIIWI01\\LOGS\\ExcelSiigo.log S 1 9999999999999 20000101 20001231 S C:\\SIIWI01\\Empleados.xlsx',
  },
  {
    name: 'PUSHEMPL',
    kind: 'import',
    title: 'Importar Empleados a SIIGO',
    group: 'Nomina',
    params: importParams('C:\\SIIWI01\\Empleados.xlsx', 'C:\\SIIWI01\\LOGS\\ErrorEmpleados.xlsx'),
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2022 PUSHEMPL L Usuario Clave C:\\SIIWI01\\LOGS\\ExcelSiigo.log C:\\SIIWI01\\Empleados.xlsx C:\\SIIWI01\\LOGS\\ErrorEmpleados.xlsx',
    notes: [NOTA_TEMP],
  },

  // ── Novedades de nomina ───────────────────────────────────────────────────
  {
    name: 'GETNOV',
    kind: 'export',
    title: 'Extraer Novedades de Nomina',
    group: 'Nomina',
    params: [
      {
        name: 'tipoNovedad',
        cli: 'TipoNovedad',
        type: { kind: 'enum', values: ['C', 'L', 'P', 'E', 'R', 'A', 'I', 'V', 'G'] },
        description:
          'C = cesantias, L = licencias, P = anticipo de primas, E = embargos, R = prestamos, A = ahorros, I = incapacidad, V = vacaciones, G = generales.',
      },
      archivoSalida('C:\\SIIWI01\\novedadvac.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2019 GETNOV L ADMON 1111 C:\\SIIWI01\\LOGS\\ExcelSiigo.log V C:\\SIIWI01\\novedadvac.xlsx',
  },

  // ── Informes ──────────────────────────────────────────────────────────────
  {
    name: 'GETINF',
    kind: 'export',
    title: 'Extraer Informes',
    group: 'Informes',
    params: [
      {
        name: 'tipoInforme',
        cli: 'TipoInforme',
        type: { kind: 'enum', values: ['B', 'BCC'] },
        description: 'B = balance de comprobacion por tercero, BCC = balance de comprobacion por cuenta.',
      },
      digits('nitInicial', 'NitInicial', 13, {
        default: '1',
        description:
          'Con tipoInforme B es el tercero inicial (hasta 13 digitos). Con BCC es la cuenta inicial (hasta 10 digitos).',
      }),
      digits('nitFinal', 'NitFinal', 13, {
        default: '9999999999999',
        description:
          'Con tipoInforme B es el tercero final (hasta 13 digitos). Con BCC es la cuenta final (hasta 10 digitos).',
      }),
      digits('mesInicial', 'MesInicial', 2, { pad: true, default: '01', description: 'Mes inicial, 2 digitos. Ej: 03.' }),
      digits('mesFinal', 'MesFinal', 2, { pad: true, default: '12', description: 'Mes final, 2 digitos. Ej: 12.' }),
      archivoSalida('C:\\SIIWI01\\BALANCEPORTERCEROS.xlsx'),
    ],
    example:
      'ExcelSIIGO C:\\SIIWI01\\ 2019 GETINF L ADMON 1111 C:\\SIIWI01\\LOGS\\ExcelSiigo.log B 1 9999999999999 03 12 C:\\SIIWI01\\BALANCEPORTERCEROS.xls',
    notes: [
      'El manual reusa NitInicial/NitFinal para el rango de cuentas cuando tipoInforme es BCC.',
      'El ejemplo del manual para BCC escribe B en lugar de BCC; es una errata del manual.',
    ],
  },
];

/** Indice por nombre de funcion, en mayusculas. */
export const FUNCTIONS_BY_NAME = new Map(FUNCTIONS.map((f) => [f.name, f]));

export function findFunction(name: string): FunctionSpec | undefined {
  return FUNCTIONS_BY_NAME.get(name.trim().toUpperCase());
}
