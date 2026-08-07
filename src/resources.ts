/**
 * Recursos y prompt del servidor.
 *
 * Advertencia honesta sobre su alcance: nada de esto ayuda a quien todavia no ha conseguido
 * registrar el servidor, porque solo existe una vez que el cliente lo arranco, y bastantes
 * clientes no leen los recursos por su cuenta. Se incluye porque reutiliza texto y datos que ya
 * existen, y porque en los clientes con menu de slash-commands el prompt es la unica forma de que
 * una persona arranque el flujo correcto sin leer documentacion.
 *
 * La superficie util antes del registro es la CLI: `--help`, `--doctor` y `--print-config`.
 */
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { FUNCTIONS, findFunction } from './catalog/functions.js';
import { isRequired } from './catalog/types.js';
import { guiaInicio } from './docs/guia.js';
import { toolNameFor } from './tools/schema.js';
import { SERVER_NAME, SERVER_VERSION } from './version.js';

export function registerResources(server: McpServer): void {
  server.registerResource(
    'guia',
    'siigo://guia/inicio',
    {
      title: 'Guia de inicio de siigo-pyme-mcp',
      description:
        'Requisitos del equipo, variables de entorno, pasos de instalacion y los fallos de instalacion mas '
        + 'frecuentes con su causa. Es el mismo texto que imprime "npx -y siigo-pyme-mcp --help".',
      mimeType: 'text/markdown',
    },
    () => ({
      contents: [
        {
          uri: 'siigo://guia/inicio',
          mimeType: 'text/markdown',
          // Fuente unica con --help: si divergieran, una de las dos mentiria.
          text: guiaInicio({ nombre: SERVER_NAME, version: SERVER_VERSION }),
        },
      ],
    }),
  );

  server.registerResource(
    'funcion',
    new ResourceTemplate('siigo://funcion/{nombre}', {
      list: () => ({
        resources: FUNCTIONS.map((fn) => ({
          uri: `siigo://funcion/${fn.name}`,
          name: `${fn.name} - ${fn.title}`,
          description: `Firma de ${fn.name} (${fn.group}) tal como la documenta el manual de SIIGO.`,
          mimeType: 'text/markdown',
        })),
      }),
    }),
    {
      title: 'Firma de una funcion de ExcelSIIGO',
      description: 'Parametros, orden posicional, valores por defecto y ejemplo del manual de una funcion.',
      mimeType: 'text/markdown',
    },
    (uri, variables) => {
      const nombre = String(variables['nombre'] ?? '').toUpperCase();
      const fn = findFunction(nombre);
      const text = fn
        ? firmaMarkdown(fn.name)
        : `# ${nombre}\n\nNo existe esa funcion. Use la herramienta siigo_list_functions para ver el catalogo.\n`;
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] };
    },
  );
}

/** Misma informacion que `siigo_describe_function`, en markdown para que se lea sin herramientas. */
function firmaMarkdown(nombre: string): string {
  const fn = findFunction(nombre);
  if (!fn) return `# ${nombre}\n\nNo existe esa funcion.\n`;

  const l: string[] = [];
  l.push(`# ${fn.name} - ${fn.title}`);
  l.push('');
  l.push(`Grupo: ${fn.group}. Tipo: ${fn.kind === 'export' ? 'exportacion' : 'importacion'}.`);
  l.push(`Herramienta MCP: \`${toolNameFor(fn)}\` (perfil all) o \`siigo_run_function\` con \`funcion: "${fn.name}"\`.`);
  if (fn.kind === 'import') {
    l.push('');
    l.push('**ESCRIBE en la contabilidad de la empresa y no se puede deshacer desde aqui.**');
  }
  l.push('');
  l.push('Prefijo posicional comun: `RutaEmpresa Anio ' + fn.name + ' Norma Usuario Clave NombreLog`.');
  l.push('');
  l.push('| # | Parametro | En el manual | Tipo | Obligatorio | Por defecto |');
  l.push('| - | --------- | ------------ | ---- | ----------- | ----------- |');
  fn.params.forEach((p, i) => {
    l.push(`| ${i + 1} | ${p.name} | ${p.cli} | ${p.type.kind} | ${isRequired(p) ? 'si' : 'no'} | ${p.default ?? '-'} |`);
  });
  l.push('');
  l.push('Ejemplo del manual:');
  l.push('');
  l.push('```');
  l.push(fn.exampleFix?.line ?? fn.example);
  l.push('```');
  if (fn.exampleFix) {
    l.push('');
    l.push(`Errata del manual corregida: ${fn.exampleFix.reason}`);
  }
  if (fn.notes?.length) {
    l.push('');
    l.push('Notas del manual:');
    for (const n of fn.notes) l.push(`- ${n}`);
  }
  return `${l.join('\n')}\n`;
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'siigo_puesta_en_marcha',
    {
      title: 'Poner en marcha siigo-pyme-mcp',
      description: 'Diagnostica el entorno, deja las credenciales configuradas y hace una exportacion de prueba.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              'Pon en marcha el acceso a SIIGO Pyme, en este orden:\n\n'
              + '1. Ejecuta siigo_doctor y muestrame su textoLegible. Si el veredicto no es "listo", resuelve o '
              + 'explicame cada punto de siguientesPasos antes de continuar.\n'
              + '2. Ejecuta siigo_list_companies y dime que empresas hay y cuales ya tienen credenciales.\n'
              + '3. Si falta alguna credencial, preguntame usuario y clave y guardalos con siigo_set_credentials '
              + '(sin "empresa" si el mismo usuario vale para todas).\n'
              + '4. Haz una exportacion pequena de prueba contra una empresa: consulta primero '
              + 'siigo_describe_function("GETTER") y luego ejecutala pidiendo pocas filas.\n'
              + '5. Resumeme si quedo funcionando y que limitaciones debo tener en cuenta.\n\n'
              + 'No ejecutes ninguna funcion PUSH*: escriben en la contabilidad y no se pueden deshacer.',
          },
        },
      ],
    }),
  );
}
