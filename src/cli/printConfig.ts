/**
 * Emisor del bloque de configuracion que hay que pegar en el cliente MCP.
 *
 * Criterio: primero los **primitivos** (transport, command, args, env), que es lo unico que el
 * protocolo garantiza y lo unico valido para un cliente que no conozcamos; despues los ejemplos
 * por cliente, cada uno etiquetado con el fichero donde va. Ningun ejemplo se presenta como *el*
 * formato.
 *
 * Todos los bloques llevan `-y` en npx. Sin el, npx pide confirmacion por consola, se queda
 * esperando, y el cliente MCP interpreta ese silencio como que el servidor no arranco. Es la
 * causa mas frecuente de "no logro instalarlo".
 */
import { fileURLToPath } from 'node:url';
import type { ClientId } from '../cli.js';
import { SERVER_NAME } from '../version.js';

export interface BloqueConfig {
  /** Cliente al que corresponde. */
  id: ClientId | 'absoluto';
  titulo: string;
  /** Fichero donde va el bloque, cuando aplica. */
  ruta?: string;
  nota: string;
  bloque: string;
}

export interface PrintConfigOptions {
  cliente?: ClientId;
  /** Emite tambien la variante sin npx, con rutas absolutas reales de esta maquina. */
  absoluto?: boolean;
  /** Clave con la que se registra el servidor en el cliente. Por defecto `siigo`. */
  nombre?: string;
}

const ENV_EJEMPLO: Record<string, string> = { SIIGO_USUARIO: 'TU_USUARIO', SIIGO_CLAVE: 'TU_CLAVE' };

/**
 * Ruta real de este `dist/index.js` y del node que lo ejecuta, resueltas en esta maquina.
 * Este modulo vive en `dist/cli/`, de ahi el `../` hacia el punto de entrada.
 */
export function rutasAbsolutas(): { node: string; script: string } {
  return { node: process.execPath, script: fileURLToPath(new URL('../index.js', import.meta.url)) };
}

function jsonEnLinea(v: unknown): string {
  return JSON.stringify(v);
}

function primitivos(nombre: string): BloqueConfig {
  const lineas = [
    'transport : stdio',
    'command   : npx',
    `args      : ["-y", "${SERVER_NAME}"]`,
    'env       : SIIGO_USUARIO, SIIGO_CLAVE, SIIGO_ANO, SIIGO_TOOLS, SIIGO_MCP_CONFIG_DIR (todas opcionales)',
    'cwd       : indiferente',
    `nombre    : ${nombre} (la clave con la que el cliente lo lista; puede ser cualquiera)`,
  ];
  return {
    id: 'primitivos',
    titulo: 'Primitivos - uselos si su cliente no aparece abajo',
    nota:
      'Es lo unico que el protocolo MCP garantiza. Traduzcalos al formato de su cliente.'
      + ' El "-y" no es opcional.',
    bloque: lineas.join('\n'),
  };
}

/**
 * Bloque YAML de hermes.
 *
 * hermes guarda `args` y `env` como STRINGS JSON dentro del YAML, no como lista y mapa YAML.
 * Escribir YAML idiomatico aqui produce una configuracion que hermes no acepta, y es la clase de
 * detalle que nadie adivina leyendo la documentacion del protocolo.
 */
function bloqueHermes(nombre: string, command: string, args: string[]): string {
  return [
    'mcp:',
    '  servers:',
    `    ${nombre}:`,
    '      type: stdio',
    `      command: ${command}`,
    `      args: '${jsonEnLinea(args)}'`,
    `      env: '${jsonEnLinea(ENV_EJEMPLO)}'`,
  ].join('\n');
}

function hermes(nombre: string): BloqueConfig {
  return {
    id: 'hermes',
    titulo: 'hermes',
    ruta: '%LOCALAPPDATA%\\hermes\\config.yaml  ->  clave mcp.servers',
    nota:
      'Ojo: en hermes "args" y "env" son STRINGS JSON dentro del YAML, no una lista y un mapa YAML.'
      + ' Respete las comillas simples exactamente como aparecen. Reinicie la sesion despues de guardar.',
    bloque: bloqueHermes(nombre, 'npx', ['-y', SERVER_NAME]),
  };
}

function claudeDesktop(nombre: string): BloqueConfig {
  const cfg = { mcpServers: { [nombre]: { command: 'npx', args: ['-y', SERVER_NAME], env: ENV_EJEMPLO } } };
  return {
    id: 'claude-desktop',
    titulo: 'Claude Desktop',
    ruta: '%APPDATA%\\Claude\\claude_desktop_config.json',
    nota: 'Reinicie Claude Desktop por completo despues de guardar.',
    bloque: JSON.stringify(cfg, null, 2),
  };
}

function claudeCode(nombre: string): BloqueConfig {
  return {
    id: 'claude-code',
    titulo: 'Claude Code (CLI)',
    nota: 'Un solo comando; no hay que editar ficheros. El "--" separa los argumentos del servidor.',
    bloque: `claude mcp add ${nombre} -- npx -y ${SERVER_NAME}`,
  };
}

function vscode(nombre: string): BloqueConfig {
  const cfg = { servers: { [nombre]: { type: 'stdio', command: 'npx', args: ['-y', SERVER_NAME], env: ENV_EJEMPLO } } };
  return {
    id: 'vscode',
    titulo: 'VS Code',
    ruta: '.vscode\\mcp.json (en el espacio de trabajo)',
    nota: 'La clave de nivel superior es "servers", no "mcpServers".',
    bloque: JSON.stringify(cfg, null, 2),
  };
}

function cursor(nombre: string): BloqueConfig {
  const cfg = { mcpServers: { [nombre]: { command: 'npx', args: ['-y', SERVER_NAME], env: ENV_EJEMPLO } } };
  return {
    id: 'cursor',
    titulo: 'Cursor',
    ruta: '.cursor\\mcp.json (proyecto) o %USERPROFILE%\\.cursor\\mcp.json (global)',
    nota: 'Reinicie Cursor despues de guardar.',
    bloque: JSON.stringify(cfg, null, 2),
  };
}

/**
 * Variante sin npx, con las rutas reales de esta maquina.
 *
 * Respeta el formato del cliente pedido: emitir JSON a alguien que configura hermes en YAML seria
 * darle un bloque que no puede pegar, que es exactamente el problema que este subcomando resuelve.
 */
function absoluto(nombre: string, cliente?: ClientId): BloqueConfig {
  const { node, script } = rutasAbsolutas();
  const nota =
    'Uselo si el cliente MCP no encuentra npx en su PATH, o si el arranque de npx tarda tanto que el'
    + ' cliente se rinde. Las rutas de abajo son las reales de esta instalacion, ya resueltas.';

  if (cliente === 'hermes') {
    return { id: 'absoluto', titulo: 'Sin npx - rutas absolutas de esta maquina (formato hermes)', nota, bloque: bloqueHermes(nombre, node, [script]) };
  }
  if (cliente === 'claude-code') {
    return {
      id: 'absoluto',
      titulo: 'Sin npx - rutas absolutas de esta maquina',
      nota,
      bloque: `claude mcp add ${nombre} -- "${node}" "${script}"`,
    };
  }

  // El resto de clientes soportados usan una de las dos formas JSON.
  const entrada = { command: node, args: [script], env: ENV_EJEMPLO };
  const cfg = cliente === 'vscode' ? { servers: { [nombre]: { type: 'stdio', ...entrada } } } : { mcpServers: { [nombre]: entrada } };
  return { id: 'absoluto', titulo: 'Sin npx - rutas absolutas de esta maquina', nota, bloque: JSON.stringify(cfg, null, 2) };
}

const CONSTRUCTORES: Record<ClientId, (n: string) => BloqueConfig> = {
  primitivos,
  hermes,
  'claude-desktop': claudeDesktop,
  'claude-code': claudeCode,
  vscode,
  cursor,
};

export function printableConfigs(o: PrintConfigOptions = {}): BloqueConfig[] {
  const nombre = o.nombre?.trim() || 'siigo';
  const bloques: BloqueConfig[] = [primitivos(nombre)];

  if (o.cliente && o.cliente !== 'primitivos') {
    bloques.push(CONSTRUCTORES[o.cliente](nombre));
  } else if (!o.cliente) {
    for (const id of ['hermes', 'claude-desktop', 'claude-code', 'vscode', 'cursor'] as ClientId[]) {
      bloques.push(CONSTRUCTORES[id](nombre));
    }
  }

  if (o.absoluto) bloques.push(absoluto(nombre, o.cliente));
  return bloques;
}

export function formatConfigs(bloques: BloqueConfig[]): string {
  const l: string[] = [];
  for (const b of bloques) {
    l.push(`=== ${b.titulo} ===`);
    if (b.ruta) l.push(`Fichero: ${b.ruta}`);
    l.push(b.nota);
    l.push('');
    l.push(b.bloque);
    l.push('');
  }

  // Dejar los marcadores tal cual es PEOR que no poner env: con credenciales invalidas SIIGO
  // abre un cuadro de dialogo y se queda esperando un clic, en vez de fallar limpiamente.
  if (bloques.some((b) => b.bloque.includes('TU_USUARIO'))) {
    l.push(`Sustituya TU_USUARIO y TU_CLAVE por sus credenciales de SIIGO, o borre "env" por completo`);
    l.push(`y guardelas luego con la herramienta siigo_set_credentials. Dejar los marcadores tal cual`);
    l.push(`es peor que no ponerlos: SIIGO rechaza el acceso abriendo un cuadro de dialogo.`);
    l.push('');
  }

  l.push(`Despues de pegarlo y reiniciar el cliente: npx -y ${SERVER_NAME} --doctor`);
  return `${l.join('\n')}\n`;
}
