/**
 * Emisor de las reglas de agente que hay que instalar en el CLIENTE, no en el servidor.
 *
 * Resuelve el problema hermano de `printConfig.ts`: registrar el servidor no basta para que el
 * agente sepa usarlo, porque varios clientes MCP descartan `instructions` del `InitializeResult`
 * sin avisar (asi lo hace hermes: captura el `InitializeResult` solo para inspeccionar
 * `capabilities` y nunca lee `.instructions`). Este bloque va a la capa de reglas del propio
 * cliente -- una skill, un `AGENTS.md`, las instrucciones del proyecto -- que si se carga antes
 * de la primera llamada.
 *
 * El servidor ya cubre el canal in-band (`siigo_start_here` y el preambulo de las herramientas
 * en `tools/preamble.ts`); esto es la capa adicional para quien quiera que el agente lo sepa
 * *antes* de tocar una herramienta.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ClientId } from '../cli.js';
import { protocoloParrafos } from '../docs/protocolo.js';
import { SERVER_NAME } from '../version.js';

export interface BloqueReglas {
  id: ClientId;
  titulo: string;
  /** Ruta absoluta donde instalar, si este cliente tiene una carpeta de reglas conocida. */
  ruta?: string;
  nota: string;
  bloque: string;
}

export interface PrintAgentRulesOptions {
  cliente?: ClientId;
  nombre?: string;
}

/** Cuerpo en markdown, sin frontmatter: el protocolo mas el flujo, listo para pegar en cualquier fichero de reglas. */
function cuerpoReglas(nombre: string): string {
  const l: string[] = [];
  l.push(`# Como usar ${nombre} (SIIGO Pyme)`);
  l.push('');
  l.push(
    'Antes de llamar a cualquier herramienta `siigo_*` en esta conversacion, lea esto. Este texto existe '
    + 'porque el cliente MCP puede no reenviar las instrucciones que manda el servidor al conectarse, asi '
    + 'que hay que tenerlo tambien aqui.',
  );
  l.push('');
  for (const p of protocoloParrafos({ perfil: 'core' })) l.push(p, '');
  l.push(
    'Nota sobre el perfil: con `SIIGO_TOOLS=all` cada funcion tiene su propia herramienta '
    + '(`siigo_getmov`, `siigo_getter`, ...) en vez de `siigo_run_function`; el resto del flujo es igual.',
  );
  return l.join('\n').trimEnd() + '\n';
}

/** Version con frontmatter `name`/`description`, para clientes que instalan skills como fichero. */
function skillMarkdown(nombre: string): string {
  const frontmatter = [
    '---',
    `name: ${nombre}`,
    'description: Como usar el servidor MCP de SIIGO Pyme -- por donde empezar, que confirmar antes de escribir en la contabilidad, y la trampa que hace que un error de parametros parezca un exito.',
    '---',
    '',
  ].join('\n');
  return frontmatter + cuerpoReglas(nombre);
}

/** Carpeta de skills de hermes en esta maquina, o undefined si no se puede resolver. */
function carpetaSkillsHermes(): string | undefined {
  const base = process.env['LOCALAPPDATA'];
  return base ? join(base, 'hermes', 'skills') : undefined;
}

interface Destino {
  ruta: string;
  contenido: (nombre: string) => string;
}

/** Donde instalar la regla para cada cliente, cuando se conoce una carpeta de reglas fija. */
function destinoParaCliente(cliente: ClientId, nombre: string): Destino | undefined {
  switch (cliente) {
    case 'hermes': {
      const carpeta = carpetaSkillsHermes();
      return carpeta ? { ruta: join(carpeta, nombre, 'SKILL.md'), contenido: skillMarkdown } : undefined;
    }
    case 'claude-code':
      // Relativa al proyecto donde se ejecuta el comando: es como Claude Code carga skills locales.
      return { ruta: join(process.cwd(), '.claude', 'skills', nombre, 'SKILL.md'), contenido: skillMarkdown };
    default:
      return undefined;
  }
}

function bloqueGenerico(cliente: ClientId, titulo: string, nota: string, nombre: string): BloqueReglas {
  return { id: cliente, titulo, nota, bloque: cuerpoReglas(nombre) };
}

function bloqueParaCliente(cliente: ClientId, nombre: string): BloqueReglas {
  const destino = destinoParaCliente(cliente, nombre);

  if (cliente === 'hermes') {
    return {
      id: 'hermes',
      titulo: 'hermes',
      ruta: destino?.ruta ?? '%LOCALAPPDATA%\\hermes\\skills\\' + nombre + '\\SKILL.md',
      nota:
        'Se instala como skill de hermes. Guarde el bloque en esa ruta (o use --instalar) y hermes la carga '
        + 'sola al iniciar sesion; no hace falta reiniciar mas que la sesion del agente.',
      bloque: skillMarkdown(nombre),
    };
  }

  if (cliente === 'claude-code') {
    return {
      id: 'claude-code',
      titulo: 'Claude Code (CLI)',
      ruta: destino?.ruta,
      nota:
        'Se instala como skill de proyecto. Con --instalar queda en .claude/skills/'
        + `${nombre}/SKILL.md dentro del proyecto actual; Claude Code la ofrece por su nombre.`,
      bloque: skillMarkdown(nombre),
    };
  }

  if (cliente === 'claude-desktop') {
    return bloqueGenerico(
      cliente,
      'Claude Desktop',
      'No tiene una carpeta de skills de fichero: pegue este bloque en las instrucciones del proyecto '
      + '(Project instructions) que use para hablar con SIIGO.',
      nombre,
    );
  }

  if (cliente === 'vscode') {
    return bloqueGenerico(
      cliente,
      'VS Code',
      'Pegue este bloque en un AGENTS.md del espacio de trabajo, o en las instrucciones del chat del '
      + 'agente que use.',
      nombre,
    );
  }

  if (cliente === 'cursor') {
    return bloqueGenerico(
      cliente,
      'Cursor',
      'Pegue este bloque en .cursor\\rules o en un AGENTS.md del proyecto.',
      nombre,
    );
  }

  // primitivos
  return bloqueGenerico(
    'primitivos',
    'Cualquier cliente',
    'Sin una carpeta de reglas conocida para su cliente, peguelo donde sea que lea instrucciones de '
    + 'proyecto o de agente antes de la conversacion.',
    nombre,
  );
}

export function printableAgentRules(o: PrintAgentRulesOptions = {}): BloqueReglas[] {
  const nombre = o.nombre?.trim() || SERVER_NAME;
  if (o.cliente) return [bloqueParaCliente(o.cliente, nombre)];

  const clientes: ClientId[] = ['hermes', 'claude-code', 'claude-desktop', 'vscode', 'cursor', 'primitivos'];
  return clientes.map((c) => bloqueParaCliente(c, nombre));
}

export function formatAgentRules(bloques: BloqueReglas[]): string {
  const l: string[] = [];
  for (const b of bloques) {
    l.push(`=== ${b.titulo} ===`);
    if (b.ruta) l.push(`Fichero: ${b.ruta}`);
    l.push(b.nota);
    l.push('');
    l.push(b.bloque);
    l.push('');
  }
  return l.join('\n');
}

export interface InstalarResultado {
  ok: boolean;
  ruta?: string;
  mensaje: string;
}

/**
 * Escribe el bloque de reglas en la carpeta del cliente, solo si se conoce una ruta fija.
 *
 * Nunca sobrescribe un fichero existente con contenido distinto salvo `forzar`: instalar una
 * skill silenciosamente sobre una que el usuario ya edito seria peor que no instalar nada.
 */
export async function instalarAgentRules(
  cliente: ClientId,
  o: { nombre?: string; forzar?: boolean } = {},
): Promise<InstalarResultado> {
  const nombre = o.nombre?.trim() || SERVER_NAME;
  const destino = destinoParaCliente(cliente, nombre);
  if (!destino) {
    return {
      ok: false,
      mensaje:
        `No hay una carpeta de reglas conocida para instalar automaticamente en "${cliente}". `
        + 'Use --print-agent-rules (sin --instalar) y peguelo a mano donde indique la nota.',
    };
  }

  const contenido = destino.contenido(nombre);
  const existente = await leerSiExiste(destino.ruta);
  if (existente !== undefined && existente !== contenido && !o.forzar) {
    return {
      ok: false,
      ruta: destino.ruta,
      mensaje:
        `Ya existe "${destino.ruta}" con contenido distinto. No se sobrescribe: vuelva a ejecutar con `
        + '--forzar si quiere reemplazarlo.',
    };
  }

  await mkdir(dirname(destino.ruta), { recursive: true });
  await writeFile(destino.ruta, contenido, 'utf8');
  return { ok: true, ruta: destino.ruta, mensaje: `Escrito en "${destino.ruta}".` };
}

async function leerSiExiste(ruta: string): Promise<string | undefined> {
  try {
    if (!(await stat(ruta)).isFile()) return undefined;
    return await readFile(ruta, 'utf8');
  } catch {
    return undefined;
  }
}
