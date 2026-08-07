/**
 * Herramientas de descubrimiento, configuracion y lectura de resultados.
 *
 * Ninguna de ellas ejecuta `EXCELSIIGO.exe`; sirven para que el agente sepa contra que
 * empresa puede trabajar y para releer los `.xlsx` ya generados.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FUNCTIONS, findFunction } from '../catalog/functions.js';
import { companyKey, configPath, saveConfig } from '../config/store.js';
import type { SiigoContext } from '../context.js';
import { runDoctor } from '../doctor/checks.js';
import { formatReport } from '../doctor/report.js';
import { EXE_NAME } from '../siigo/discovery.js';
import { DEFAULT_LIMIT, readSheet } from '../xlsx/read.js';

/** Toda respuesta viaja como JSON en un bloque de texto, que es lo que todo cliente MCP entiende. */
function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function fail(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

export function registerMetaTools(server: McpServer, ctx: SiigoContext): void {
  // Va primera a proposito: es la que resuelve el "no funciona y no se por que", y aparecer al
  // principio de tools/list la hace mas facil de encontrar.
  server.registerTool(
    'siigo_doctor',
    {
      title: 'Diagnosticar el entorno de SIIGO',
      description:
        'Comprueba que este equipo pueda ejecutar SIIGO: Windows, instalaciones con EXCELSIIGO.exe, Microsoft Excel, '
        + 'sesion de escritorio activa, configuracion, credenciales, empresas accesibles y margen frente al limite de '
        + '50 caracteres en las rutas. No ejecuta EXCELSIIGO.exe ni toca la contabilidad. Ejecutela primero cuando '
        + 'una funcion falle sin una explicacion clara.',
      inputSchema: {
        incluirEmpresas: z
          .boolean()
          .optional()
          .describe('Descubrir las empresas, que implica escanear discos y tarda mas. Por defecto si.'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ incluirEmpresas }) => {
      const informe = await runDoctor({ ctx, incluirEmpresas: incluirEmpresas ?? true });
      // Nunca se marca isError: un veredicto "no-listo" es un diagnostico exitoso, no un fallo
      // de la herramienta. El agente decide que hacer leyendo `veredicto` y `siguientesPasos`.
      return json({ ...informe, textoLegible: formatReport(informe) });
    },
  );

  server.registerTool(
    'siigo_list_installations',
    {
      title: 'Listar instalaciones de SIIGO',
      description:
        `Instalaciones de SIIGO Pyme detectadas en el equipo (carpetas con ${EXE_NAME}). `
        + 'Se buscan en el registro de Windows, en la configuracion del servidor y escaneando las unidades.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const installations = await ctx.installations();
      return json({
        total: installations.length,
        instalaciones: installations.map((i) => ({
          carpeta: i.dir,
          ejecutable: i.exePath,
          version: i.version,
          origen: i.source,
          empresaDeclarada: i.filePath?.companyPath ?? null,
          servidorUnc: i.filePath?.unc ?? null,
        })),
      });
    },
  );

  server.registerTool(
    'siigo_list_companies',
    {
      title: 'Listar empresas de SIIGO',
      description:
        'Empresas SIIWInn visibles. Para cada instalacion se lee filepath.txt y se exploran las carpetas '
        + 'hermanas SIIWI00..SIIWI99, descartando las que no contienen datos de SIIGO. Indica si cada empresa '
        + 'ya tiene credenciales configuradas.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const companies = await ctx.companies();
      return json({
        total: companies.length,
        empresas: companies.map((c) => ({
          ruta: c.path,
          numero: c.number,
          alias: c.alias,
          instalaciones: c.installations,
          declaradaEnFilepathTxt: c.declared,
          tieneCredenciales: c.hasCredentials,
          accesible: c.reachable,
        })),
        aviso: companies.some((c) => !c.reachable)
          ? 'Hay empresas marcadas como no accesibles. Suele ser una unidad de red mapeada pero desconectada: '
            + 'vuelva a conectarla antes de ejecutar funciones contra ellas.'
          : undefined,
      });
    },
  );

  server.registerTool(
    'siigo_list_functions',
    {
      title: 'Listar funciones de ExcelSIIGO',
      description:
        'Catalogo de las 47 funciones del CLI, con el nombre de la herramienta MCP equivalente. '
        + 'Use siigo_describe_function para ver los parametros de una en concreto.',
      inputSchema: {
        grupo: z.string().optional().describe('Filtra por grupo. Ej: Inventarios, Contabilidad, Nomina.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ grupo }) => {
      const filtered = grupo
        ? FUNCTIONS.filter((f) => f.group.toLowerCase().includes(grupo.toLowerCase()))
        : FUNCTIONS;
      return json({
        total: filtered.length,
        funciones: filtered.map((f) => ({
          funcion: f.name,
          herramienta: `siigo_${f.name.toLowerCase()}`,
          titulo: f.title,
          grupo: f.group,
          tipo: f.kind === 'export' ? 'exporta a xlsx' : 'importa desde xlsx',
        })),
      });
    },
  );

  server.registerTool(
    'siigo_describe_function',
    {
      title: 'Describir una funcion de ExcelSIIGO',
      description: 'Parametros, orden posicional, valores por defecto y ejemplo del manual para una funcion.',
      inputSchema: {
        funcion: z.string().describe('Nombre de la funcion. Ej: GETMOV, PUSHTER.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ funcion }) => {
      const fn = findFunction(funcion);
      if (!fn) return fail(`La funcion "${funcion}" no existe. Use siigo_list_functions para ver el catalogo.`);

      return json({
        funcion: fn.name,
        herramienta: `siigo_${fn.name.toLowerCase()}`,
        titulo: fn.title,
        grupo: fn.group,
        tipo: fn.kind === 'export' ? 'exporta a xlsx' : 'importa desde xlsx',
        prefijoPosicional: ['RutaEmpresa', 'Anio', fn.name, 'Norma', 'Usuario', 'Clave', 'NombreLog'],
        parametros: fn.params.map((p, i) => ({
          posicion: i + 1,
          nombre: p.name,
          nombreEnElManual: p.cli,
          tipo: p.type.kind,
          obligatorio: p.default === undefined,
          porDefecto: p.default === '' ? '(ruta generada por el servidor)' : (p.default ?? null),
          descripcion: p.description,
        })),
        ejemploDelManual: fn.example,
        erratasDelManual: fn.exampleFix?.reason ?? null,
        notas: fn.notes ?? [],
      });
    },
  );

  server.registerTool(
    'siigo_set_credentials',
    {
      title: 'Guardar credenciales de SIIGO',
      description:
        'Guarda usuario y clave en la configuracion del servidor. Sin "empresa" se guarda como credencial por '
        + 'defecto para todas las empresas, que es lo mas comodo si se usa el mismo usuario en todas. Con "empresa" '
        + 'se guarda solo para esa. La clave nunca se devuelve en ninguna respuesta.',
      inputSchema: {
        usuario: z.string().max(8).describe('Usuario de SIIGO, hasta 8 caracteres.'),
        clave: z.string().max(8).describe('Clave del usuario, hasta 8 caracteres.'),
        empresa: z
          .string()
          .optional()
          .describe('Ruta de la empresa para la que aplica. Omitir para guardar la credencial por defecto.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ usuario, clave, empresa }) => {
      const config = await ctx.config();

      if (empresa) {
        const key = companyKey(empresa);
        config.companies[key] = { ...config.companies[key], user: usuario, password: clave };
      } else {
        config.defaultCredentials = { user: usuario, password: clave };
      }

      const target = await saveConfig(config);
      ctx.invalidate();

      return json({
        guardado: true,
        archivo: target,
        alcance: empresa ? `empresa ${companyKey(empresa)}` : 'todas las empresas (credencial por defecto)',
        usuario,
        aviso:
          'La clave viaja como argumento en la linea de comando de EXCELSIIGO.exe y es visible en la tabla de '
          + 'procesos de Windows mientras dura la ejecucion. Es una limitacion del CLI de SIIGO.',
      });
    },
  );

  server.registerTool(
    'siigo_set_company_alias',
    {
      title: 'Asignar alias a una empresa',
      description: 'Da un nombre legible a una empresa para poder referirse a ella por nombre en vez de por ruta.',
      inputSchema: {
        empresa: z.string().describe('Ruta de la empresa. Ej: Z:\\SIIWI01\\'),
        alias: z.string().describe('Nombre legible. Ej: Inmunotek.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ empresa, alias }) => {
      const config = await ctx.config();
      const key = companyKey(empresa);
      config.companies[key] = { ...config.companies[key], alias };
      const target = await saveConfig(config);
      ctx.invalidate();
      return json({ guardado: true, archivo: target, empresa: key, alias });
    },
  );

  server.registerTool(
    'siigo_add_installation',
    {
      title: 'Registrar una instalacion de SIIGO',
      description:
        `Agrega manualmente una carpeta de instalacion cuando el autodescubrimiento no la encuentra. `
        + `Debe contener ${EXE_NAME}.`,
      inputSchema: {
        carpeta: z.string().describe('Carpeta de la instalacion. Ej: D:\\Siigo.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ carpeta }) => {
      const config = await ctx.config();
      const clean = carpeta.trim().replace(/\\+$/, '');
      if (!config.installations.some((i) => i.toUpperCase() === clean.toUpperCase())) {
        config.installations.push(clean);
      }
      const target = await saveConfig(config);
      ctx.invalidate();

      const installations = await ctx.installations();
      const found = installations.some((i) => i.dir.toUpperCase() === clean.toUpperCase());
      if (!found) {
        return fail(
          `Se guardo "${clean}" en ${target}, pero no se encontro ${EXE_NAME} dentro de esa carpeta, asi que no se `
          + 'puede usar todavia. Verifique la ruta.',
        );
      }
      return json({ guardado: true, archivo: target, instalacion: clean });
    },
  );

  server.registerTool(
    'siigo_get_config',
    {
      title: 'Ver la configuracion del servidor',
      description: 'Muestra la configuracion actual. Las claves aparecen enmascaradas.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const config = await ctx.config();
      return json({
        archivo: configPath(),
        carpetaDeSalida: config.outputDir,
        norma: config.norma,
        timeoutSegundos: Math.round(config.timeoutMs / 1000),
        instalacionesDeclaradas: config.installations,
        credencialPorDefecto: config.defaultCredentials
          ? { usuario: config.defaultCredentials.user, clave: '********' }
          : null,
        empresas: Object.fromEntries(
          Object.entries(config.companies).map(([key, value]) => [
            key,
            { alias: value.alias ?? null, usuario: value.user ?? null, clave: value.password ? '********' : null, anio: value.year ?? null },
          ]),
        ),
      });
    },
  );

  server.registerTool(
    'siigo_read_xlsx',
    {
      title: 'Leer un archivo xlsx',
      description:
        'Lee de forma paginada cualquier .xlsx generado por SIIGO. Util para recorrer un resultado grande '
        + 'despues de que una funcion de exportacion devolviera solo la primera pagina.',
      inputSchema: {
        ruta: z.string().describe('Ruta completa del archivo .xlsx.'),
        offset: z.number().int().min(0).optional().describe('Fila de datos desde la que empezar, 0-based. Por defecto 0.'),
        limite: z.number().int().min(1).max(500).optional().describe(`Maximo de filas a devolver. Por defecto ${DEFAULT_LIMIT}.`),
        hoja: z.union([z.string(), z.number()]).optional().describe('Nombre o indice 1-based de la hoja. Por defecto la primera.'),
        filaEncabezado: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            'Fila 1-based donde estan los titulos de las columnas. Por defecto se detecta sola: '
            + 'los modelos de SIIGO llevan el nombre de la empresa y del modelo encima de los encabezados.',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ ruta, offset, limite, hoja, filaEncabezado }) => {
      try {
        const page = await readSheet(ruta, { offset, limit: limite, sheet: hoja, headerRow: filaEncabezado });
        return json({
          archivo: ruta,
          hoja: page.sheetName,
          hojasDisponibles: page.sheetNames,
          filaEncabezado: page.headerRow,
          columnas: page.columns,
          totalFilas: page.rowCount,
          offset: page.offset,
          filas: page.rows,
          siguienteOffset: page.nextOffset,
        });
      } catch (err) {
        return fail(`No se pudo leer "${ruta}": ${(err as Error).message}`);
      }
    },
  );
}
