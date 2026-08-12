import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatAgentRules, instalarAgentRules, printableAgentRules } from './agentRules.js';

describe('printableAgentRules', () => {
  it('sin --cliente devuelve un bloque por cada cliente conocido', () => {
    const bloques = printableAgentRules();
    expect(bloques.map((b) => b.id)).toEqual([
      'hermes',
      'claude-code',
      'claude-desktop',
      'vscode',
      'cursor',
      'primitivos',
    ]);
  });

  it('--cliente limita la salida a ese cliente', () => {
    const bloques = printableAgentRules({ cliente: 'hermes' });
    expect(bloques).toHaveLength(1);
    expect(bloques[0]?.id).toBe('hermes');
  });

  it('el bloque de hermes es una skill con frontmatter', () => {
    const [b] = printableAgentRules({ cliente: 'hermes' });
    expect(b!.bloque.startsWith('---\n')).toBe(true);
    expect(b!.bloque).toContain('name: siigo-pyme-mcp');
    expect(b!.ruta).toContain('hermes');
    expect(b!.ruta).toContain('SKILL.md');
  });

  it('el bloque de claude-code apunta a .claude/skills dentro del proyecto', () => {
    const [b] = printableAgentRules({ cliente: 'claude-code' });
    expect(b!.ruta).toContain('.claude');
    expect(b!.ruta).toContain('skills');
  });

  it('los clientes sin carpeta de reglas conocida no traen ruta', () => {
    for (const id of ['claude-desktop', 'vscode', 'cursor', 'primitivos'] as const) {
      const [b] = printableAgentRules({ cliente: id });
      expect(b!.ruta).toBeUndefined();
    }
  });

  it('el protocolo menciona la trampa del codigo 081 y las funciones PUSH*', () => {
    // Es el contenido que existe para que llegue: si falta, el bloque no sirve para nada.
    const [b] = printableAgentRules({ cliente: 'hermes' });
    expect(b!.bloque).toContain('081');
    expect(b!.bloque).toContain('PUSH*');
  });

  it('--nombre cambia el nombre de la skill y la ruta', () => {
    const [b] = printableAgentRules({ cliente: 'claude-code', nombre: 'siigo' });
    expect(b!.bloque).toContain('name: siigo');
    expect(b!.ruta).toContain(join('skills', 'siigo', 'SKILL.md'));
  });

  it('formatAgentRules incluye el fichero cuando se conoce', () => {
    const salida = formatAgentRules(printableAgentRules({ cliente: 'hermes' }));
    expect(salida).toContain('Fichero:');
    expect(salida).toContain('SKILL.md');
  });
});

describe('instalarAgentRules', () => {
  let dir: string;
  const original = process.env['LOCALAPPDATA'];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'siigo-agent-rules-'));
    process.env['LOCALAPPDATA'] = dir;
  });

  afterEach(async () => {
    process.env['LOCALAPPDATA'] = original;
    await rm(dir, { recursive: true, force: true });
  });

  it('escribe la skill de hermes en LOCALAPPDATA', async () => {
    const r = await instalarAgentRules('hermes', { nombre: 'siigo' });
    expect(r.ok).toBe(true);
    expect(r.ruta).toBe(join(dir, 'hermes', 'skills', 'siigo', 'SKILL.md'));
    const contenido = await readFile(r.ruta!, 'utf8');
    expect(contenido).toContain('name: siigo');
  });

  it('no sobrescribe un fichero existente con contenido distinto sin --forzar', async () => {
    await instalarAgentRules('hermes', { nombre: 'siigo' });
    const ruta = join(dir, 'hermes', 'skills', 'siigo', 'SKILL.md');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(ruta, 'editado a mano', 'utf8');

    const r = await instalarAgentRules('hermes', { nombre: 'siigo' });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('--forzar');
    expect(await readFile(ruta, 'utf8')).toBe('editado a mano');
  });

  it('--forzar reemplaza el fichero existente', async () => {
    await instalarAgentRules('hermes', { nombre: 'siigo' });
    const ruta = join(dir, 'hermes', 'skills', 'siigo', 'SKILL.md');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(ruta, 'editado a mano', 'utf8');

    const r = await instalarAgentRules('hermes', { nombre: 'siigo', forzar: true });
    expect(r.ok).toBe(true);
    expect(await readFile(ruta, 'utf8')).toContain('name: siigo');
  });

  it('rechaza clientes sin carpeta de reglas conocida', async () => {
    const r = await instalarAgentRules('vscode', {});
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('No hay una carpeta de reglas conocida');
  });
});
