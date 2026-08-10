/**
 * Precedencia de credenciales y anio.
 *
 * Estas dos funciones deciden CONTRA QUE se ejecuta cada corrida: con que usuario y sobre que
 * anio contable. Que sus reglas coincidan no es cosmetica; que divergieran fue un fallo real,
 * porque volvia impredecible el anio consultado segun donde estuviera configurado.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { companyKey, resolveCredentials, resolveYear, type SiigoConfig } from './store.js';

const EMPRESA = 'Z:\\SIIWI01\\';

function config(over: Partial<SiigoConfig> = {}): SiigoConfig {
  return {
    installations: [],
    companies: {},
    outputDir: 'C:\\SiigoMCP\\out',
    norma: 'L',
    timeoutMs: 180_000,
    ...over,
  };
}

const ORIGINAL = { usuario: process.env.SIIGO_USUARIO, clave: process.env.SIIGO_CLAVE, ano: process.env.SIIGO_ANO };

beforeEach(() => {
  delete process.env.SIIGO_USUARIO;
  delete process.env.SIIGO_CLAVE;
  delete process.env.SIIGO_ANO;
});

afterEach(() => {
  for (const [k, v] of [['SIIGO_USUARIO', ORIGINAL.usuario], ['SIIGO_CLAVE', ORIGINAL.clave], ['SIIGO_ANO', ORIGINAL.ano]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('companyKey', () => {
  it('normaliza a mayusculas, con barra final y separador de Windows', () => {
    expect(companyKey('z:/siiwi01')).toBe('Z:\\SIIWI01\\');
    expect(companyKey(' Z:\\SIIWI01\\ ')).toBe('Z:\\SIIWI01\\');
  });
});

describe('resolveCredentials', () => {
  const conTodo = config({
    companies: { [EMPRESA]: { user: 'PORCOMP', password: 'p1' } },
    defaultCredentials: { user: 'PORDEF', password: 'p2' },
  });

  it('lo explicito manda sobre todo', () => {
    process.env.SIIGO_USUARIO = 'DELENV';
    process.env.SIIGO_CLAVE = 'e1';
    expect(resolveCredentials(conTodo, EMPRESA, { user: 'EXPL', password: 'x' }).user).toBe('EXPL');
  });

  it('el entorno manda sobre el valor por empresa', () => {
    process.env.SIIGO_USUARIO = 'DELENV';
    process.env.SIIGO_CLAVE = 'e1';
    expect(resolveCredentials(conTodo, EMPRESA).user).toBe('DELENV');
  });

  it('el valor por empresa manda sobre el por defecto', () => {
    expect(resolveCredentials(conTodo, EMPRESA).user).toBe('PORCOMP');
  });

  it('cae al valor por defecto cuando la empresa no tiene el suyo', () => {
    expect(resolveCredentials(conTodo, 'Z:\\SIIWI09\\').user).toBe('PORDEF');
  });

  it('sin ninguna fuente lanza, y el mensaje dice las dos formas de arreglarlo', () => {
    expect(() => resolveCredentials(config(), EMPRESA)).toThrow(/siigo_set_credentials/);
    expect(() => resolveCredentials(config(), EMPRESA)).toThrow(/SIIGO_USUARIO/);
  });

  it('nunca revela la clave en el mensaje de error', () => {
    // Falta el usuario pero hay clave: el error no debe llevarsela consigo.
    const soloClave = config({ defaultCredentials: { user: '', password: 'SECRETA123' } });
    expect(() => resolveCredentials(soloClave, EMPRESA)).toThrow();
    try {
      resolveCredentials(soloClave, EMPRESA);
    } catch (err) {
      expect((err as Error).message).not.toContain('SECRETA123');
    }
  });
});

describe('resolveYear', () => {
  const conAmbos = config({ companies: { [EMPRESA]: { year: '2025' } } });

  it('lo explicito manda sobre todo', () => {
    process.env.SIIGO_ANO = '2024';
    expect(resolveYear(conAmbos, EMPRESA, '2023')).toBe('2023');
  });

  it('el entorno manda sobre el valor por empresa, igual que en las credenciales', () => {
    // Hasta la 0.3.0 esto devolvia '2025': el valor por empresa ganaba, al contrario que en
    // resolveCredentials. La asimetria hacia impredecible el anio consultado.
    process.env.SIIGO_ANO = '2024';
    expect(resolveYear(conAmbos, EMPRESA)).toBe('2024');
  });

  it('sin entorno usa el valor por empresa', () => {
    expect(resolveYear(conAmbos, EMPRESA)).toBe('2025');
  });

  it('sin nada usa el anio actual', () => {
    expect(resolveYear(config(), EMPRESA)).toBe(String(new Date().getFullYear()));
  });

  it('la precedencia coincide con la de resolveCredentials', () => {
    // El contrato que fija esta prueba: mismas fuentes, mismo orden, para las dos funciones.
    process.env.SIIGO_ANO = '2024';
    process.env.SIIGO_USUARIO = 'DELENV';
    process.env.SIIGO_CLAVE = 'e1';
    const cfg = config({
      companies: { [EMPRESA]: { year: '2025', user: 'PORCOMP', password: 'p1' } },
    });
    expect(resolveYear(cfg, EMPRESA)).toBe('2024');
    expect(resolveCredentials(cfg, EMPRESA).user).toBe('DELENV');
  });
});
