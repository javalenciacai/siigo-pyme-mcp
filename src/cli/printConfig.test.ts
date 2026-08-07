import { parse as parsePath } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatConfigs, printableConfigs } from './printConfig.js';

describe('printableConfigs', () => {
  it('pone los primitivos primero, siempre', () => {
    // Es lo unico que el protocolo garantiza: si el cliente del usuario no esta en la lista,
    // los primitivos son la unica respuesta honesta.
    expect(printableConfigs()[0]?.id).toBe('primitivos');
    expect(printableConfigs({ cliente: 'hermes' })[0]?.id).toBe('primitivos');
  });

  it('todos los bloques que invocan npx llevan -y', () => {
    // Sin -y, npx pide confirmacion, se cuelga esperando, y el cliente lo lee como
    // "el servidor no arranco". Es la causa mas frecuente de instalacion fallida.
    for (const b of printableConfigs({ absoluto: true })) {
      if (b.bloque.includes('npx')) expect(b.bloque).toContain('-y');
    }
  });

  it('los bloques JSON son JSON valido', () => {
    for (const b of printableConfigs()) {
      if (!b.bloque.trimStart().startsWith('{')) continue;
      expect(() => JSON.parse(b.bloque)).not.toThrow();
    }
  });

  it('el bloque de hermes trae args y env como STRINGS JSON, no como YAML', () => {
    // hermes guarda esos dos campos como cadenas JSON dentro del YAML. Escribir una lista
    // YAML idiomatica produce una configuracion que hermes no acepta.
    const hermes = printableConfigs({ cliente: 'hermes' }).find((b) => b.id === 'hermes');
    expect(hermes).toBeDefined();
    const args = hermes!.bloque.match(/args: '(.+)'/)?.[1];
    const env = hermes!.bloque.match(/env: '(.+)'/)?.[1];
    expect(args).toBeDefined();
    expect(env).toBeDefined();
    expect(JSON.parse(args!)).toEqual(['-y', 'siigo-pyme-mcp']);
    expect(JSON.parse(env!)).toHaveProperty('SIIGO_USUARIO');
  });

  it('nunca sugiere una credencial real, solo marcadores', () => {
    const todo = printableConfigs({ absoluto: true }).map((b) => b.bloque).join('\n');
    expect(todo).toContain('TU_USUARIO');
    expect(todo).toContain('TU_CLAVE');
  });

  it('--cliente limita la salida a los primitivos y ese cliente', () => {
    const r = printableConfigs({ cliente: 'cursor' });
    expect(r.map((b) => b.id)).toEqual(['primitivos', 'cursor']);
  });

  it('--absoluto anade un bloque con rutas reales de esta maquina', () => {
    const abs = printableConfigs({ absoluto: true }).find((b) => b.id === 'absoluto');
    expect(abs).toBeDefined();
    const cfg = JSON.parse(abs!.bloque) as { mcpServers: Record<string, { command: string; args: string[] }> };
    const entrada = Object.values(cfg.mcpServers)[0]!;
    expect(entrada.command).toBe(process.execPath);
    // La ruta apuntada tiene que ser el punto de entrada, no este modulo.
    expect(parsePath(entrada.args[0]!).base).toBe('index.js');
  });

  it('--nombre cambia la clave con la que se registra', () => {
    const r = printableConfigs({ cliente: 'claude-desktop', nombre: 'siigo-pyme' });
    expect(r.find((b) => b.id === 'claude-desktop')!.bloque).toContain('"siigo-pyme"');
  });

  it('formatConfigs cierra recordando el diagnostico', () => {
    expect(formatConfigs(printableConfigs()).trimEnd().split('\n').at(-1)).toContain('--doctor');
  });
});
