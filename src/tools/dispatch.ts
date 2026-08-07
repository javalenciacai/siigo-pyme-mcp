/**
 * Despachador `siigo_run_function`: una sola herramienta que ejecuta cualquiera de las 47
 * funciones del catalogo por nombre.
 *
 * Es lo que hace viable el perfil `core` (ver `profile.ts`): en vez de 47 schemas permanentes en
 * el contexto del modelo, uno solo, y los parametros concretos se consultan bajo demanda con
 * `siigo_describe_function`.
 *
 * Consecuencia que hay que compensar: al colapsar las 47 herramientas en una se pierde el
 * `destructiveHint` por funcion. Antes cada `PUSH*` venia marcada como destructiva en su propio
 * schema; aqui la proteccion pasa a ser explicita con `confirmarEscritura`, porque una
 * importacion escribe en la contabilidad y el servidor no puede deshacerla.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FUNCTIONS } from '../catalog/functions.js';
import type { FunctionSpec } from '../catalog/types.js';
import type { SiigoContext } from '../context.js';
import { executeFunction, type ToolExtra } from './functions.js';
import { commonInputs, exportInputs, paramsSchemaFor } from './schema.js';

const inputSchema = {
  funcion: z
    .string()
    .describe('Nombre de la funcion de ExcelSIIGO. Ej: GETMOV, GETTER, PUSHTER. Use siigo_list_functions para verlas.'),
  params: z
    .record(z.union([z.string(), z.number()]))
    .optional()
    .describe(
      'Parametros propios de la funcion, por nombre. Consulte siigo_describe_function para saber cuales lleva y en '
      + 'que formato: el CLI acepta un valor mal formateado, lo reporta como codigo 081 y aun asi termina con codigo 0.',
    ),
  confirmarEscritura: z
    .boolean()
    .optional()
    .describe(
      'Obligatorio en true para las funciones PUSH*, que ESCRIBEN en la contabilidad de la empresa. '
      + 'Confirme con el usuario antes de enviarlo: el servidor no puede deshacer una importacion.',
    ),
  ...commonInputs,
  ...exportInputs,
};

interface DispatchInput {
  funcion: string;
  params?: Record<string, string | number>;
  confirmarEscritura?: boolean;
  [k: string]: unknown;
}

function fail(text: string) {
  return { isError: true as const, content: [{ type: 'text' as const, text }] };
}

/** Busca la funcion sin distinguir mayusculas: el CLI solo acepta el nombre en mayusculas. */
export function buscar(nombre: string): FunctionSpec | undefined {
  const canonico = nombre.trim().toUpperCase();
  return FUNCTIONS.find((f) => f.name === canonico);
}

export type Resolucion =
  | { ok: true; fn: FunctionSpec; entrada: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Valida una llamada al despachador sin ejecutar nada.
 *
 * Separado del handler para poder probarlo sin levantar un servidor MCP, y porque las tres
 * razones de rechazo (funcion inexistente, importacion sin confirmar, parametros invalidos) son
 * exactamente el contrato que hay que fijar con tests.
 */
export function resolverLlamada(raw: DispatchInput): Resolucion {
  const fn = buscar(raw.funcion ?? '');
  if (!fn) {
    return { ok: false, error: `La funcion "${raw.funcion}" no existe. Use siigo_list_functions para ver el catalogo completo.` };
  }

  if (fn.kind === 'import' && raw.confirmarEscritura !== true) {
    return {
      ok: false,
      error:
        `${fn.name} ESCRIBE en la contabilidad de la empresa y no se puede deshacer desde aqui. `
        + 'Confirme con el usuario y vuelva a llamar con confirmarEscritura=true.',
    };
  }

  const validados = paramsSchemaFor(fn).safeParse(raw.params ?? {});
  if (!validados.success) {
    const detalles = validados.error.issues
      .map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('; ');
    return {
      ok: false,
      error:
        `${fn.name}: los parametros no son validos. ${detalles}. `
        + `Use siigo_describe_function("${fn.name}") para ver el nombre, el orden y el formato exacto de cada uno.`,
    };
  }

  // Se reaplanan los parametros porque `executeFunction` los espera al mismo nivel que los
  // campos comunes, igual que en las herramientas dedicadas del perfil `all`.
  const { funcion: _f, params: _p, confirmarEscritura: _c, ...comunes } = raw;
  return { ok: true, fn, entrada: { ...comunes, ...validados.data } };
}

export function registerDispatchTool(server: McpServer, ctx: SiigoContext): void {
  server.registerTool(
    'siigo_run_function',
    {
      title: 'Ejecutar una funcion de ExcelSIIGO',
      description:
        `Ejecuta cualquiera de las ${FUNCTIONS.length} funciones de SIIGO Pyme por nombre. Las de exportacion generan `
        + 'un .xlsx y devuelven sus primeras filas; las PUSH* importan y exigen confirmarEscritura=true. '
        + 'Llame antes a siigo_describe_function: un parametro mal formateado hace que el CLI responda 081 '
        + 'y termine con codigo 0, asi que el error se parece a un exito.',
      inputSchema,
      annotations: {
        // No se puede afinar por llamada: el despachador cubre tambien las importaciones.
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    (async (raw: DispatchInput, extra: ToolExtra) => {
      const r = resolverLlamada(raw);
      if (!r.ok) return fail(r.error);
      return executeFunction(ctx, r.fn, r.entrada, extra);
    }) as never,
  );
}
