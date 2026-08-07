/**
 * Lo que un agente ve de cada funcion.
 *
 * El objetivo de estas pruebas es la defensa contra el codigo 081: el CLI acepta un parametro
 * mal formateado, lo registra como 081 y termina con codigo 0, asi que el unico momento de
 * evitarlo es cuando el modelo rellena los argumentos. Por eso el formato exacto tiene que estar
 * en la descripcion de CADA parametro, no solo en la de la herramienta.
 */
import { describe, expect, it } from 'vitest';
import { FUNCTIONS, findFunction } from '../catalog/functions.js';
import { isRequired } from '../catalog/types.js';
import { descriptionFor, formatoHint, inputSchemaFor, paramsSchemaFor, toolNameFor } from './schema.js';
import { DEFAULT_PROFILE, toolProfile } from './profile.js';

describe('descriptionFor', () => {
  it('nombra los parametros obligatorios y apunta al formato exacto', () => {
    const fn = findFunction('GETMOV');
    if (!fn) throw new Error('GETMOV no esta en el catalogo');
    const d = descriptionFor(fn);
    for (const p of fn.params.filter(isRequired)) expect(d).toContain(p.name);
    expect(d).toContain('siigo_describe_function("GETMOV")');
  });

  it('advierte que una importacion escribe en la contabilidad', () => {
    for (const fn of FUNCTIONS.filter((f) => f.kind === 'import')) {
      expect(descriptionFor(fn)).toContain('ESCRIBE en la contabilidad');
    }
  });

  it('no promete escritura en una exportacion', () => {
    for (const fn of FUNCTIONS.filter((f) => f.kind === 'export')) {
      expect(descriptionFor(fn)).not.toContain('ESCRIBE');
    }
  });
});

describe('formatoHint', () => {
  it('cubre todos los tipos del catalogo sin dejar ninguno vacio', () => {
    for (const fn of FUNCTIONS) {
      for (const p of fn.params) expect(formatoHint(p).trim().length, `${fn.name}.${p.name}`).toBeGreaterThan(0);
    }
  });

  it('dice el formato literal de las fechas', () => {
    const fn = findFunction('GETMOV');
    const fecha = fn?.params.find((p) => p.type.kind === 'mmdd');
    if (!fecha) throw new Error('GETMOV deberia tener una fecha MMDD');
    expect(formatoHint(fecha)).toContain('MMDD');
  });
});

describe('inputSchemaFor', () => {
  it('cada parametro cita su nombre del manual, que es el que sale en los errores', () => {
    for (const fn of FUNCTIONS) {
      const shape = inputSchemaFor(fn);
      for (const p of fn.params) {
        expect(shape[p.name]?.description, `${fn.name}.${p.name}`).toContain(p.cli);
      }
    }
  });

  it('incluye los campos comunes y, solo en exportaciones, filasPreview', () => {
    const exportacion = FUNCTIONS.find((f) => f.kind === 'export')!;
    const importacion = FUNCTIONS.find((f) => f.kind === 'import')!;
    expect(inputSchemaFor(exportacion)).toHaveProperty('empresa');
    expect(inputSchemaFor(exportacion)).toHaveProperty('filasPreview');
    expect(inputSchemaFor(importacion)).not.toHaveProperty('filasPreview');
  });
});

describe('paramsSchemaFor', () => {
  it('solo lleva los parametros propios, sin los campos comunes', () => {
    const fn = findFunction('GETMOV')!;
    const shape = paramsSchemaFor(fn).shape;
    expect(shape).not.toHaveProperty('empresa');
    for (const p of fn.params) expect(shape).toHaveProperty(p.name);
  });

  it('acepta vacio cuando todos los parametros tienen valor por defecto', () => {
    const fn = findFunction('GETTER')!;
    expect(paramsSchemaFor(fn).safeParse({}).success).toBe(true);
  });
});

describe('toolNameFor', () => {
  it('genera nombres unicos en minusculas', () => {
    const nombres = FUNCTIONS.map(toolNameFor);
    expect(new Set(nombres).size).toBe(nombres.length);
    for (const n of nombres) expect(n).toMatch(/^siigo_[a-z0-9]+$/);
  });
});

describe('toolProfile', () => {
  it('por defecto es core, para no inundar el contexto del cliente', () => {
    expect(toolProfile({})).toBe('core');
    expect(DEFAULT_PROFILE).toBe('core');
  });

  it('reconoce all, sin distinguir mayusculas ni espacios', () => {
    expect(toolProfile({ SIIGO_TOOLS: 'all' })).toBe('all');
    expect(toolProfile({ SIIGO_TOOLS: ' ALL ' })).toBe('all');
  });

  it('un valor que no reconoce cae al perfil por defecto en vez de fallar', () => {
    expect(toolProfile({ SIIGO_TOOLS: 'todas' })).toBe('core');
  });
});
