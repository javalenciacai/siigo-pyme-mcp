/**
 * Tests dorados: el manual de SIIGO trae una linea `Ejemplo:` por funcion. Reconstruir el
 * argv con esos mismos valores debe reproducir la linea token por token.
 *
 * Es la unica defensa real contra el error `081 Parametros de la funcion GET tienen
 * errores`, que el binario reporta con codigo de salida 0 y sin escribir nada.
 */
import { describe, expect, it } from 'vitest';
import { FUNCTIONS } from '../catalog/functions.js';
import type { FunctionSpec } from '../catalog/types.js';
import { buildArgv, type CommonArgs } from './args.js';

/** Divide la linea `Ejemplo:` en tokens, colapsando los espacios dobles del manual. */
function tokenize(line: string): string[] {
  return line.trim().split(/\s+/);
}

interface ParsedExample {
  common: CommonArgs;
  extras: string[];
}

function parseExample(fn: FunctionSpec): ParsedExample {
  const line = fn.exampleFix?.line ?? fn.example;
  const t = tokenize(line);

  expect(t[0], `${fn.name}: el ejemplo debe empezar por ExcelSIIGO`).toBe('ExcelSIIGO');
  expect(t[3], `${fn.name}: el cuarto token del ejemplo debe ser el nombre de la funcion`).toBe(fn.name);

  return {
    common: {
      companyPath: t[1]!,
      year: t[2]!,
      norma: t[4]!,
      user: t[5]!,
      password: t[6]!,
      logPath: t[7]!,
    },
    extras: t.slice(8),
  };
}

describe('catalogo', () => {
  it('declara exactamente 47 funciones', () => {
    expect(FUNCTIONS).toHaveLength(47);
  });

  it('no repite nombres de funcion', () => {
    const names = FUNCTIONS.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('no repite nombres de parametro dentro de una funcion', () => {
    for (const fn of FUNCTIONS) {
      const names = fn.params.map((p) => p.name);
      expect(new Set(names).size, `${fn.name} tiene parametros duplicados`).toBe(names.length);
    }
  });
});

describe('buildArgv reproduce el ejemplo del manual', () => {
  for (const fn of FUNCTIONS) {
    it(`${fn.name} — ${fn.title}`, () => {
      const { common, extras } = parseExample(fn);

      expect(
        extras,
        `${fn.name}: el ejemplo trae ${extras.length} parametros y el catalogo declara ${fn.params.length}`,
      ).toHaveLength(fn.params.length);

      // Los valores del ejemplo entran por nombre, en el mismo orden posicional.
      const input: Record<string, string> = {};
      fn.params.forEach((p, i) => {
        input[p.name] = extras[i]!;
      });

      const { argv } = buildArgv(fn, common, input);

      expect(argv).toEqual([
        common.companyPath,
        common.year,
        fn.name,
        common.norma,
        common.user,
        common.password,
        common.logPath,
        ...extras,
      ]);
    });
  }
});

describe('valores por defecto', () => {
  const common: CommonArgs = {
    companyPath: 'Z:\\SIIWI01\\',
    year: '2026',
    norma: 'L',
    user: 'ADMON',
    password: '1111',
    logPath: 'Z:\\SIIWI01\\LOGS\\mcp0001.log',
  };

  for (const fn of FUNCTIONS) {
    it(`${fn.name} se puede construir aportando solo lo obligatorio`, () => {
      const input: Record<string, string> = {};
      for (const p of fn.params) {
        // Los parametros de ruta declaran default vacio: el runner inyecta la ruta real.
        if (p.type.kind === 'outfile') input[p.name] = 'C:\\SiigoMCP\\out\\salida.xlsx';
        else if (p.type.kind === 'infile') input[p.name] = 'C:\\SiigoMCP\\in\\entrada.xlsx';
        else if (p.type.kind === 'errlog') input[p.name] = 'C:\\SiigoMCP\\out\\errores.xlsx';
        else if (p.default === undefined) {
          // Obligatorio sin default: usar el valor que trae el ejemplo del manual.
          const { extras } = parseExample(fn);
          const idx = fn.params.indexOf(p);
          input[p.name] = extras[idx]!;
        }
      }

      const { argv } = buildArgv(fn, common, input);
      expect(argv).toHaveLength(7 + fn.params.length);
      expect(argv[2]).toBe(fn.name);
    });
  }
});
