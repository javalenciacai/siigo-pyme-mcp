/**
 * Fuente unica del protocolo de uso del agente.
 *
 * Lo consumen `instructions` del `InitializeResult` (src/server.ts), la herramienta
 * `siigo_start_here`, el recurso MCP `siigo://protocolo` y `--print-agent-rules`. Existe
 * porque `instructions` es un canal que varios clientes MCP descartan sin avisar: capturan el
 * `InitializeResult` solo para leer `capabilities` y nunca miran `.instructions` (asi lo hace
 * hermes en `tools/mcp_tool.py`). Repetir este texto por canal es la unica forma de que llegue
 * de verdad, y tenerlo en un solo sitio evita que una copia quede desactualizada y mienta.
 *
 * Se escribe sin tildes por la misma razon que `docs/guia.ts`: la consola de Windows suele
 * estar en codepage 850 u 437 y destroza los acentos.
 */
import type { ToolProfile } from '../tools/profile.js';

export interface ProtocoloContexto {
  perfil: ToolProfile;
}

/** Texto del protocolo, en parrafos, sin envolver: cada consumidor decide como presentarlos. */
export function protocoloParrafos(ctx: ProtocoloContexto): string[] {
  const ejecutar =
    ctx.perfil === 'core'
      ? 'siigo_run_function, indicando la funcion por nombre'
      : 'la herramienta de la funcion (siigo_getmov, siigo_getter, ...)';

  return [
    'Este servidor opera SIIGO Pyme a traves de EXCELSIIGO.exe.',
    'Si algo falla, la PRIMERA llamada es siigo_doctor: comprueba Windows, la instalacion de SIIGO, Excel, la '
      + 'sesion de escritorio, las credenciales y las empresas accesibles, y dice que falta.',
    'Antes de ejecutar una funcion que no se haya usado en esta conversacion, llame a siigo_describe_function. '
      + 'El CLI acepta un parametro mal formateado, lo registra como codigo 081 y aun asi termina con codigo 0: un '
      + 'error de parametros se parece a un exito, y esa es la unica forma de devolver datos equivocados.',
    'Las funciones PUSH* ESCRIBEN en la contabilidad y no se pueden deshacer desde aqui. Confirme con el usuario '
      + 'antes de ejecutarlas, y nunca las use contra datos reales para "probar".',
    'Requisitos del equipo: Microsoft Excel instalado y una sesion de escritorio activa, porque SIIGO genera los '
      + 'archivos con Excel por COM. Durante cada ejecucion se ven las ventanas de SIIGO y de Excel: es normal, no es '
      + 'un fallo, y no se pueden ocultar. Las ejecuciones son seriales: el CLI no admite instancias simultaneas.',
    `Flujo habitual: siigo_list_companies, siigo_set_credentials si falta alguna credencial, ${ejecutar}, y `
      + 'siigo_read_xlsx para paginar un resultado grande.',
  ];
}

/** El mismo texto, como un unico bloque separado por lineas en blanco. */
export function protocoloAgente(ctx: ProtocoloContexto): string {
  return protocoloParrafos(ctx).join('\n\n');
}
