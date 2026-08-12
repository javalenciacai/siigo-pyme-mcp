import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SiigoContext } from './context.js';
import { protocoloAgente } from './docs/protocolo.js';
import { registerPrompts, registerResources } from './resources.js';
import { registerDispatchTool } from './tools/dispatch.js';
import { registerFunctionTools } from './tools/functions.js';
import { registerMetaTools } from './tools/meta.js';
import { toolProfile } from './tools/profile.js';
import { SERVER_NAME, SERVER_VERSION } from './version.js';

// Se reexportan para no romper a quien ya las importaba de aqui.
export { SERVER_NAME, SERVER_VERSION };

export function createServer(): McpServer {
  const profile = toolProfile();
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    // Canal que varios clientes MCP descartan sin avisar (ver docs/protocolo.ts: hermes captura
    // el InitializeResult solo para leer capabilities y nunca lee .instructions). Se manda
    // igual porque no cuesta nada, pero `siigo_start_here` y el preambulo de las herramientas
    // (tools/preamble.ts) son las vias que llegan siempre.
    { instructions: protocoloAgente({ perfil: profile }) },
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
