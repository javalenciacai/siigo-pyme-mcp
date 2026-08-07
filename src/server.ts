import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SiigoContext } from './context.js';
import { registerFunctionTools } from './tools/functions.js';
import { registerMetaTools } from './tools/meta.js';

// La version se lee del package.json en vez de duplicarla aqui: al publicar se sube con
// `npm version`, y una constante escrita a mano se queda atras sin que nada lo detecte.
// Se usa createRequire y no un import de JSON para no arrastrar el package.json dentro de
// dist/ y alterar el rootDir de la compilacion.
const pkg = createRequire(import.meta.url)('../package.json') as { name: string; version: string };

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;

export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'Este servidor opera SIIGO Pyme a traves de EXCELSIIGO.exe.\n\n'
        + 'Flujo habitual: siigo_list_companies para ver las empresas, siigo_set_credentials si alguna no tiene '
        + 'credenciales, y luego la herramienta de la funcion que corresponda (siigo_getmov, siigo_getter, ...).\n\n'
        + 'Requisitos del equipo: Microsoft Excel instalado y una sesion de escritorio activa, porque SIIGO genera '
        + 'los archivos con Excel por COM. Las ejecuciones son seriales: el CLI no admite instancias simultaneas.',
    },
  );

  const ctx = new SiigoContext();
  registerMetaTools(server, ctx);
  registerFunctionTools(server, ctx);

  return server;
}
