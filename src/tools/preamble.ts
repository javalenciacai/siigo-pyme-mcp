/**
 * Preambulo de una sola vez.
 *
 * `instructions` del `InitializeResult` es un canal que varios clientes MCP descartan sin
 * avisar (ver docs/protocolo.ts), y los recursos/prompts MCP son opt-in y nadie los consulta
 * espontaneamente. El unico canal que llega siempre es el resultado de una herramienta, asi que
 * la primera vez que el agente llama a CUALQUIER herramienta `siigo_*` en el proceso, se le
 * antepone el protocolo de uso ahi mismo.
 *
 * `siigo_start_here` (tools/meta.ts) tambien lo marca al llamarse, para que un agente que si la
 * invierta explicitamente no reciba el protocolo duplicado en su siguiente llamada.
 */
import type { SiigoContext } from '../context.js';
import { protocoloAgente } from '../docs/protocolo.js';
import { toolProfile } from './profile.js';

interface ContentText {
  type: 'text';
  text: string;
}

interface ToolResult {
  isError?: boolean;
  content: ContentText[];
  [k: string]: unknown;
}

const ETIQUETA = 'PROTOCOLO DEL SERVIDOR (se muestra una sola vez en esta conversacion)';

/**
 * Anade el protocolo al final del resultado si es la primera llamada del proceso; si no, lo
 * devuelve igual.
 *
 * Se anade AL FINAL y no al principio a proposito: `content[0].text` es el contrato que ya
 * asumen tanto el propio proyecto (scripts/smoke.mjs hace `JSON.parse(resultado.content[0].text)`)
 * como, previsiblemente, cualquier cliente que lea la respuesta de una herramienta. Anteponer
 * el preambulo ahi rompe esa lectura en la primera llamada de cada proceso; anexarlo despues dejar
 * `content[0]` intacto para quien lo espera JSON, y el bloque de protocolo sigue llegando en el
 * mismo mensaje.
 */
export function conProtocolo<T extends ToolResult>(ctx: SiigoContext, resultado: T): T {
  if (!ctx.marcarProtocoloEntregado()) return resultado;

  const bloque: ContentText = {
    type: 'text',
    text: `${ETIQUETA}\n\n${protocoloAgente({ perfil: toolProfile() })}`,
  };
  return { ...resultado, content: [...resultado.content, bloque] };
}
