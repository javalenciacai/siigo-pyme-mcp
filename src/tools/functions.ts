/**
 * Registro de las 47 herramientas de funcion.
 *
 * No se escriben a mano: se generan recorriendo el catalogo, de modo que corregir una
 * firma en `catalog/functions.ts` corrige la herramienta, el esquema y la documentacion
 * al mismo tiempo.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FUNCTIONS } from '../catalog/functions.js';
import type { FunctionSpec } from '../catalog/types.js';
import { resolveCredentials, resolveYear } from '../config/store.js';
import type { SiigoContext } from '../context.js';
import { pickInstallation, resolveCompany } from '../siigo/discovery.js';
import { runFunction } from '../siigo/runner.js';
import { DEFAULT_LIMIT, readSheet } from '../xlsx/read.js';
import { descriptionFor, inputSchemaFor, toolNameFor } from './schema.js';

interface CommonInput {
  empresa: string;
  anio?: string | number;
  norma?: 'L' | 'N';
  instalacion?: string;
  usuario?: string;
  clave?: string;
  filasPreview?: number;
}

/** Separa los campos comunes de los parametros propios de la funcion. */
function splitInput(fn: FunctionSpec, input: Record<string, unknown>) {
  const common = input as unknown as CommonInput;
  const params: Record<string, unknown> = {};
  for (const p of fn.params) {
    if (input[p.name] !== undefined) params[p.name] = input[p.name];
  }
  return { common, params };
}

export function registerFunctionTools(server: McpServer, ctx: SiigoContext): void {
  for (const fn of FUNCTIONS) {
    server.registerTool(
      toolNameFor(fn),
      {
        title: fn.title,
        description: descriptionFor(fn),
        inputSchema: inputSchemaFor(fn),
        annotations: {
          readOnlyHint: fn.kind === 'export',
          // Una importacion modifica la contabilidad de la empresa y no se puede deshacer
          // desde aqui: SIIGO deja el resultado en la carpeta TEMP de la empresa.
          destructiveHint: fn.kind === 'import',
          idempotentHint: false,
        },
      },
      // El esquema se construye en tiempo de ejecucion, asi que el SDK no puede inferir
      // el tipo del argumento; se normaliza dentro de `splitInput`.
      (async (raw: Record<string, unknown>) => execute(ctx, fn, raw)) as never,
    );
  }
}

async function execute(ctx: SiigoContext, fn: FunctionSpec, raw: Record<string, unknown>) {
  const { common, params } = splitInput(fn, raw);

  try {
    const config = await ctx.config();
    const companies = await ctx.companies();
    const installations = await ctx.installations();

    const company = resolveCompany(common.empresa, companies);
    const installation = pickInstallation(company, installations, common.instalacion);
    const credentials = resolveCredentials(config, company.path, {
      ...(common.usuario ? { user: common.usuario } : {}),
      ...(common.clave ? { password: common.clave } : {}),
    });

    const result = await runFunction({
      fn,
      exePath: installation.exePath,
      installationDir: installation.dir,
      companyPath: company.path,
      year: resolveYear(config, company.path, common.anio === undefined ? undefined : String(common.anio)),
      norma: common.norma ?? config.norma,
      user: credentials.user,
      password: credentials.password,
      params,
      outputDir: config.outputDir,
      timeoutMs: config.timeoutMs,
    });

    const payload: Record<string, unknown> = {
      ok: result.ok,
      funcion: fn.name,
      empresa: company.path,
      alias: company.alias,
      instalacion: installation.dir,
      duracionMs: result.durationMs,
      parametros: result.resolvedParams,
      comando: result.commandLine,
      log: {
        ruta: result.logPath,
        lineas: result.log.lines,
        ultimasLineas: result.log.tail,
      },
    };

    if (!result.ok) payload.problemas = result.problems;
    if (result.errorLogPath) payload.logDeErrores = result.errorLogPath;

    if (fn.kind === 'export' && result.outputPath) {
      payload.archivo = result.outputPath;
      payload.bytes = result.outputBytes;

      const limite = common.filasPreview ?? DEFAULT_LIMIT;
      if (result.ok && limite > 0) {
        try {
          const page = await readSheet(result.outputPath, { limit: limite });
          payload.columnas = page.columns;
          payload.totalFilas = page.rowCount;
          payload.filas = page.rows;
          payload.siguienteOffset = page.nextOffset;
          if (page.nextOffset !== null) {
            payload.comoContinuar =
              `Use siigo_read_xlsx con ruta="${result.outputPath}" y offset=${page.nextOffset} para la siguiente pagina.`;
          }
        } catch (err) {
          payload.avisoLectura = `El archivo se genero pero no se pudo leer: ${(err as Error).message}`;
        }
      }
    }

    return {
      ...(result.ok ? {} : { isError: true as const }),
      content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    };
  } catch (err) {
    return {
      isError: true as const,
      content: [{ type: 'text' as const, text: `${fn.name}: ${(err as Error).message}` }],
    };
  }
}
