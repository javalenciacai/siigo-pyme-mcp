/**
 * Fija el formato de la salida del diagnostico.
 *
 * Estas reglas no son estetica: las etiquetas de ancho fijo hacen la salida grepeable, la
 * ausencia de tildes evita que la consola de Windows en codepage 850 la destroce, y la ultima
 * linea es lo que un agente lee cuando la salida se trunca por arriba.
 */
import { describe, expect, it } from 'vitest';
import { exitCodeFor, formatReport } from './report.js';
import type { CheckResult, DoctorReport, Veredicto } from './types.js';

function check(over: Partial<CheckResult> = {}): CheckResult {
  return { id: 'plataforma', titulo: 'Plataforma', status: 'ok', detalle: 'Windows.', bloqueante: false, ms: 1, ...over };
}

function informe(over: Partial<DoctorReport> = {}): DoctorReport {
  const checks = over.checks ?? [check()];
  return {
    veredicto: 'listo',
    siguientesPasos: [],
    servidor: { nombre: 'siigo-pyme-mcp', version: '0.2.0', node: '22.19.0', plataforma: 'win32', arch: 'x64', os: '10.0.19045' },
    generadoEn: '2026-08-07T14:02:11.000Z',
    resumen: {
      ok: checks.filter((c) => c.status === 'ok').length,
      avisos: checks.filter((c) => c.status === 'aviso').length,
      fallas: checks.filter((c) => c.status === 'falla').length,
      desconocidos: checks.filter((c) => c.status === 'desconocido').length,
    },
    ...over,
    checks,
  };
}

describe('formatReport', () => {
  it('usa etiquetas de ancho fijo', () => {
    const salida = formatReport(
      informe({
        checks: [
          check({ status: 'ok' }),
          check({ id: 'excel', titulo: 'Excel', status: 'aviso', detalle: 'x', siguientePaso: 'Haga y.' }),
          check({ id: 'node', titulo: 'Node', status: 'falla', detalle: 'x', siguientePaso: 'Haga z.' }),
          check({ id: 'sesion', titulo: 'Sesion', status: 'desconocido', detalle: 'x', siguientePaso: 'Haga w.' }),
        ],
      }),
    );
    for (const etiqueta of ['[ ok ]', '[avis]', '[fall]', '[ ?  ]']) {
      expect(salida).toContain(etiqueta);
      expect(etiqueta).toHaveLength(6);
    }
  });

  it('no emite ningun caracter fuera de ASCII', () => {
    const salida = formatReport(
      informe({
        veredicto: 'no-listo',
        siguientesPasos: ['Node: Actualice Node.'],
        checks: [check({ status: 'falla', siguientePaso: 'Actualice Node.' })],
      }),
    );
    expect(salida).toMatch(/^[\x20-\x7E\n]*$/);
  });

  it('imprime el siguiente paso solo de lo que no esta en ok', () => {
    const salida = formatReport(
      informe({ checks: [check({ status: 'ok', siguientePaso: 'NO DEBERIA VERSE.' })] }),
    );
    expect(salida).not.toContain('NO DEBERIA VERSE');
  });

  it('marca el consejo con una flecha y sangra las continuaciones sin repetirla', () => {
    const largo = `Defina SIIGO_USUARIO y SIIGO_CLAVE ${'x'.repeat(200)} y reintente.`;
    const salida = formatReport(
      informe({ checks: [check({ status: 'falla', siguientePaso: largo })] }),
    );
    expect(salida.match(/->/g)).toHaveLength(1);
  });

  it('respeta el orden de los chequeos que recibe', () => {
    const salida = formatReport(
      informe({
        checks: [
          check({ id: 'plataforma', titulo: 'Plataforma' }),
          check({ id: 'excel', titulo: 'Excel' }),
          check({ id: 'concurrencia', titulo: 'Concurrencia' }),
        ],
      }),
    );
    expect(salida.indexOf('Plataforma')).toBeLessThan(salida.indexOf('Excel'));
    expect(salida.indexOf('Excel')).toBeLessThan(salida.indexOf('Concurrencia'));
  });

  it('la ultima linea empieza siempre por "Siguiente paso:"', () => {
    const conPasos = formatReport(informe({ veredicto: 'no-listo', siguientesPasos: ['Credenciales: Defina X.'] }));
    expect(conPasos.trimEnd().split('\n').at(-1)).toMatch(/^Siguiente paso: /);

    const sinPasos = formatReport(informe());
    expect(sinPasos.trimEnd().split('\n').at(-1)).toMatch(/^Siguiente paso: /);
  });

  it('traduce el veredicto y resume el recuento', () => {
    const salida = formatReport(
      informe({
        veredicto: 'no-listo',
        siguientesPasos: ['Node: Actualice.'],
        checks: [
          check({ status: 'falla', siguientePaso: 'Actualice.' }),
          check({ id: 'excel', titulo: 'Excel', status: 'aviso', detalle: 'x', siguientePaso: 'Revise.' }),
        ],
      }),
    );
    expect(salida).toContain('Veredicto: NO LISTO (1 falla, 1 aviso).');
  });
});

describe('exitCodeFor', () => {
  const casos: [Veredicto, number][] = [
    ['listo', 0],
    ['listo-con-avisos', 0],
    ['indeterminado', 0],
    ['no-listo', 1],
  ];
  for (const [veredicto, code] of casos) {
    it(`${veredicto} -> ${code}`, () => {
      expect(exitCodeFor(informe({ veredicto }))).toBe(code);
    });
  }
});
