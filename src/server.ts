import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SiigoContext } from './context.js';
import { registerPrompts, registerResources } from './resources.js';
import { registerDispatchTool } from './tools/dispatch.js';
import { registerFunctionTools } from './tools/functions.js';
import { registerMetaTools } from './tools/meta.js';
import { toolProfile, type ToolProfile } from './tools/profile.js';
import { SERVER_NAME, SERVER_VERSION } from './version.js';

// Se reexportan para no romper a quien ya las importaba de aqui.
export { SERVER_NAME, SERVER_VERSION };

/**
 * Instrucciones del servidor, ordenadas por prioridad decreciente porque los clientes truncan.
 * Lo primero es como salir de un fallo; lo segundo, la unica trampa que produce datos falsos.
 */
function instructions(profile: ToolProfile): string {
  const ejecutar =
    profile === 'core'
      ? 'siigo_run_function, indicando la funcion por nombre'
      : 'la herramienta de la funcion (siigo_getmov, siigo_getter, ...)';

  return (
    'Este servidor opera SIIGO Pyme a traves de EXCELSIIGO.exe.\n\n'
    + 'Si algo falla, la PRIMERA llamada es siigo_doctor: comprueba Windows, la instalacion de SIIGO, Excel, la '
    + 'sesion de escritorio, las credenciales y las empresas accesibles, y dice que falta.\n\n'
    + 'Antes de ejecutar una funcion que no se haya usado en esta conversacion, llame a siigo_describe_function. '
    + 'El CLI acepta un parametro mal formateado, lo registra como codigo 081 y aun asi termina con codigo 0: un '
    + 'error de parametros se parece a un exito, y esa es la unica forma de devolver datos equivocados.\n\n'
    + 'Las funciones PUSH* ESCRIBEN en la contabilidad y no se pueden deshacer desde aqui. Confirme con el usuario '
    + 'antes de ejecutarlas, y nunca las use contra datos reales para "probar".\n\n'
    + 'Requisitos del equipo: Microsoft Excel instalado y una sesion de escritorio activa, porque SIIGO genera los '
    + 'archivos con Excel por COM. Durante cada ejecucion se ven las ventanas de SIIGO y de Excel: es normal, no es '
    + 'un fallo, y no se pueden ocultar. Las ejecuciones son seriales: el CLI no admite instancias simultaneas.\n\n'
    + `Flujo habitual: siigo_list_companies, siigo_set_credentials si falta alguna credencial, ${ejecutar}, y `
    + 'siigo_read_xlsx para paginar un resultado grande.'
  );
}

export function createServer(): McpServer {
  const profile = toolProfile();
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: instructions(profile) },
  );

  const ctx = new SiigoContext();
  registerMetaTools(server, ctx);
  // En `core` una sola herramienta cubre las 47 funciones; en `all` se registra una por funcion.
  if (profile === 'all') registerFunctionTools(server, ctx);
  else registerDispatchTool(server, ctx);

  // Los recursos no cuestan contexto salvo que el cliente los pida, al contrario que las
  // herramientas, cuyos schemas viajan en cada llamada.
  registerResources(server);
  registerPrompts(server);

  return server;
}
