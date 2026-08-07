import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SiigoContext } from './context.js';
import { registerFunctionTools } from './tools/functions.js';
import { registerMetaTools } from './tools/meta.js';

export const SERVER_NAME = 'siigo-pyme-mcp';
export const SERVER_VERSION = '0.1.0';

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
