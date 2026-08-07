import { describe, expect, it } from 'vitest';
import { parseArgs, type Comando } from './cli.js';

describe('parseArgs', () => {
  const casos: [string[], Comando][] = [
    [[], { tipo: 'servidor' }],
    [['--version'], { tipo: 'version' }],
    [['-v'], { tipo: 'version' }],
    [['--help'], { tipo: 'ayuda' }],
    [['-h'], { tipo: 'ayuda' }],
    [['help'], { tipo: 'ayuda' }],
    [['--doctor'], { tipo: 'doctor', json: false, empresas: true }],
    [['--doctor', '--json'], { tipo: 'doctor', json: true, empresas: true }],
    [['--doctor', '--sin-empresas'], { tipo: 'doctor', json: false, empresas: false }],
    [['--print-config'], { tipo: 'config', json: false, cliente: undefined, absoluto: false, nombre: undefined }],
    [
      ['--print-config', '--cliente', 'hermes'],
      { tipo: 'config', json: false, cliente: 'hermes', absoluto: false, nombre: undefined },
    ],
    [
      ['--print-config', '--cliente=vscode'],
      { tipo: 'config', json: false, cliente: 'vscode', absoluto: false, nombre: undefined },
    ],
    [
      ['--print-config', '--absoluto', '--nombre', 'siigo-pyme'],
      { tipo: 'config', json: false, cliente: undefined, absoluto: true, nombre: 'siigo-pyme' },
    ],
  ];

  for (const [argv, esperado] of casos) {
    it(`resuelve ${JSON.stringify(argv)}`, () => {
      expect(parseArgs(argv)).toEqual(esperado);
    });
  }

  it('rechaza un argumento que no conoce', () => {
    expect(parseArgs(['--doktor'])).toEqual({ tipo: 'desconocido', arg: '--doktor' });
  });

  it('rechaza un cliente que no existe, y dice cuales valen', () => {
    const r = parseArgs(['--print-config', '--cliente', 'emacs']);
    expect(r.tipo).toBe('desconocido');
    if (r.tipo === 'desconocido') expect(r.arg).toContain('hermes');
  });

  it('rechaza --cliente sin valor', () => {
    expect(parseArgs(['--print-config', '--cliente'])).toEqual({
      tipo: 'desconocido',
      arg: '--cliente (falta el valor)',
    });
  });

  it('la ayuda gana sobre cualquier otro subcomando', () => {
    // Quien escribe --help quiere leer la ayuda, no ejecutar un diagnostico.
    expect(parseArgs(['--doctor', '--help'])).toEqual({ tipo: 'ayuda' });
  });

  it('un modificador suelto sin subcomando no se adivina', () => {
    expect(parseArgs(['--json'])).toEqual({ tipo: 'desconocido', arg: '--json' });
  });
});
