/**
 * Enrutado de la linea de comandos.
 *
 * `parseArgs` es puro y esta cubierto por tests; `ejecutar` es el unico que escribe a la
 * consola. Los subcomandos (--help, --doctor, --print-config) escriben a **stdout**: no hay
 * sesion MCP que contaminar. En modo servidor la invariante es la contraria y se respeta en
 * index.ts: stdout queda reservado al protocolo y todo mensaje va por stderr.
 */
import { guiaInicio } from './docs/guia.js';
// De version.js y no de server.js: `--help` no tiene por que cargar el arbol de herramientas.
import { SERVER_NAME, SERVER_VERSION } from './version.js';

export type ClientId = 'primitivos' | 'hermes' | 'claude-desktop' | 'claude-code' | 'vscode' | 'cursor';

export const CLIENTES: ClientId[] = ['primitivos', 'hermes', 'claude-desktop', 'claude-code', 'vscode', 'cursor'];

export type Comando =
  | { tipo: 'servidor' }
  | { tipo: 'version' }
  | { tipo: 'ayuda' }
  | { tipo: 'doctor'; json: boolean; empresas: boolean }
  | { tipo: 'config'; json: boolean; cliente?: ClientId; absoluto: boolean; nombre?: string }
  | { tipo: 'reglas'; json: boolean; cliente?: ClientId; nombre?: string; instalar: boolean; forzar: boolean }
  | { tipo: 'desconocido'; arg: string };

/** Separa `--opcion=valor` en sus dos mitades; devuelve valor `undefined` si no lo trae. */
function partir(token: string): { nombre: string; valor?: string } {
  const i = token.indexOf('=');
  if (i === -1) return { nombre: token };
  return { nombre: token.slice(0, i), valor: token.slice(i + 1) };
}

export function parseArgs(argv: string[]): Comando {
  if (argv.length === 0) return { tipo: 'servidor' };

  let primario: 'version' | 'ayuda' | 'doctor' | 'config' | 'reglas' | null = null;
  let json = false;
  let empresas = true;
  let absoluto = false;
  let instalar = false;
  let forzar = false;
  let cliente: string | undefined;
  let nombre: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const crudo = argv[i] ?? '';
    const { nombre: token, valor } = partir(crudo);
    // Un valor pegado con `=` ya viene resuelto; si no, se toma el token siguiente.
    const siguiente = (): string | undefined => {
      if (valor !== undefined) return valor;
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('-')) return undefined;
      i += 1;
      return v;
    };

    switch (token) {
      case '--version':
      case '-v':
        primario ??= 'version';
        break;
      case '--help':
      case '-h':
      case 'help':
        // La ayuda gana siempre: quien la pide explicitamente quiere leerla.
        primario = 'ayuda';
        break;
      case '--doctor':
        primario ??= 'doctor';
        break;
      case '--print-config':
        primario ??= 'config';
        break;
      case '--print-agent-rules':
        primario ??= 'reglas';
        break;
      case '--json':
        json = true;
        break;
      case '--sin-empresas':
        empresas = false;
        break;
      case '--absoluto':
        absoluto = true;
        break;
      case '--instalar':
        instalar = true;
        break;
      case '--forzar':
        forzar = true;
        break;
      case '--cliente':
        cliente = siguiente();
        if (cliente === undefined) return { tipo: 'desconocido', arg: '--cliente (falta el valor)' };
        break;
      case '--nombre':
        nombre = siguiente();
        if (nombre === undefined) return { tipo: 'desconocido', arg: '--nombre (falta el valor)' };
        break;
      default:
        return { tipo: 'desconocido', arg: crudo };
    }
  }

  if (primario === 'version') return { tipo: 'version' };
  if (primario === 'ayuda') return { tipo: 'ayuda' };
  if (primario === 'doctor') return { tipo: 'doctor', json, empresas };
  if (primario === 'config') {
    if (cliente !== undefined && !CLIENTES.includes(cliente as ClientId)) {
      return { tipo: 'desconocido', arg: `--cliente ${cliente} (use: ${CLIENTES.join(', ')})` };
    }
    return { tipo: 'config', json, cliente: cliente as ClientId | undefined, absoluto, nombre };
  }
  if (primario === 'reglas') {
    if (cliente !== undefined && !CLIENTES.includes(cliente as ClientId)) {
      return { tipo: 'desconocido', arg: `--cliente ${cliente} (use: ${CLIENTES.join(', ')})` };
    }
    return { tipo: 'reglas', json, cliente: cliente as ClientId | undefined, nombre, instalar, forzar };
  }

  // Solo llegaron modificadores sueltos, sin subcomando: no se sabe que queria el usuario.
  return { tipo: 'desconocido', arg: argv[0] ?? '' };
}

/** Ejecuta un subcomando y devuelve el codigo de salida. No atiende `servidor`: eso es index.ts. */
export async function ejecutar(cmd: Comando): Promise<number> {
  const out = (t: string): void => void process.stdout.write(t);

  switch (cmd.tipo) {
    case 'version':
      out(`${SERVER_NAME} ${SERVER_VERSION}\n`);
      return 0;

    case 'ayuda':
      out(guiaInicio({ nombre: SERVER_NAME, version: SERVER_VERSION }));
      return 0;

    case 'doctor': {
      const { runDoctor } = await import('./doctor/checks.js');
      const { formatReport, exitCodeFor } = await import('./doctor/report.js');
      const informe = await runDoctor({ incluirEmpresas: cmd.empresas });
      out(cmd.json ? `${JSON.stringify(informe, null, 2)}\n` : formatReport(informe));
      return exitCodeFor(informe);
    }

    case 'config': {
      const { printableConfigs, formatConfigs } = await import('./cli/printConfig.js');
      const bloques = printableConfigs({ cliente: cmd.cliente, absoluto: cmd.absoluto, nombre: cmd.nombre });
      out(cmd.json ? `${JSON.stringify(bloques, null, 2)}\n` : formatConfigs(bloques));
      return 0;
    }

    case 'reglas': {
      const { printableAgentRules, formatAgentRules, instalarAgentRules } = await import('./cli/agentRules.js');

      if (cmd.instalar) {
        if (!cmd.cliente) {
          process.stderr.write(`${SERVER_NAME}: --instalar requiere --cliente.\n`);
          return 2;
        }
        const r = await instalarAgentRules(cmd.cliente, { nombre: cmd.nombre, forzar: cmd.forzar });
        out(cmd.json ? `${JSON.stringify(r, null, 2)}\n` : `${r.mensaje}\n`);
        return r.ok ? 0 : 1;
      }

      const bloques = printableAgentRules({ cliente: cmd.cliente, nombre: cmd.nombre });
      out(cmd.json ? `${JSON.stringify(bloques, null, 2)}\n` : formatAgentRules(bloques));
      return 0;
    }

    case 'desconocido':
      process.stderr.write(`${SERVER_NAME}: no entiendo "${cmd.arg}".\n\n`);
      process.stderr.write(guiaInicio({ nombre: SERVER_NAME, version: SERVER_VERSION }));
      return 2;

    case 'servidor':
      throw new Error('El modo servidor se atiende en index.ts, no en ejecutar().');
  }
}
