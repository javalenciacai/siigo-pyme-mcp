/**
 * Pruebas del orquestador del diagnostico.
 *
 * Todas las sondas del sistema se inyectan, asi que estos tests no necesitan Windows, ni SIIGO,
 * ni Excel: corren igual en CI sobre Linux.
 */
import { describe, expect, it } from 'vitest';
import type { SiigoContext } from '../context.js';
import type { SiigoConfig } from '../config/store.js';
import type { Company, Installation } from '../siigo/discovery.js';
import { runDoctor } from './checks.js';
import type { CheckId, DoctorEnv, DoctorReport } from './types.js';

const CONFIG_OK: SiigoConfig = {
  installations: [],
  companies: {},
  outputDir: 'C:\\SiigoMCP\\out',
  norma: 'L',
  timeoutMs: 180_000,
  defaultCredentials: { user: 'USUARIO', password: 'CLAVE123' },
};

const INSTALACION: Installation = {
  dir: 'C:\\Siigo',
  exePath: 'C:\\Siigo\\EXCELSIIGO.exe',
  version: '10.1',
  source: 'registry',
  filePath: null,
};

const EMPRESA: Company = {
  path: 'Z:\\SIIWI01\\',
  number: '01',
  alias: 'Empresa uno',
  installations: ['C:\\Siigo'],
  declared: true,
  hasCredentials: true,
  reachable: true,
};

function envBase(over: Partial<DoctorEnv> = {}): DoctorEnv {
  return {
    plataforma: 'win32',
    nodeVersion: '22.19.0',
    arch: 'x64',
    osRelease: '10.0.19045',
    env: {},
    detectExcel: async () => ({
      encontrado: true,
      exePath: 'C:\\Office\\EXCEL.EXE',
      metodo: 'app-paths',
      version: 'Office16',
    }),
    detectSession: async () => ({ sessionName: 'Console', sessionId: 1, interactiva: true, indicios: [] }),
    siigoProcesosActivos: async () => [],
    statFile: async () => ({ existe: true, esDir: true, mode: 0o600 }),
    escribible: async () => true,
    ...over,
  };
}

function ctxFalso(over: { config?: SiigoConfig; installations?: Installation[]; companies?: Company[] } = {}): SiigoContext {
  return {
    config: async () => over.config ?? CONFIG_OK,
    installations: async () => over.installations ?? [INSTALACION],
    companies: async () => over.companies ?? [EMPRESA],
    invalidate: () => undefined,
  } as unknown as SiigoContext;
}

function check(r: DoctorReport, id: CheckId) {
  const c = r.checks.find((x) => x.id === id);
  if (!c) throw new Error(`falta el chequeo ${id}`);
  return c;
}

describe('runDoctor', () => {
  it('con todo en orden da veredicto listo', async () => {
    const r = await runDoctor({ env: envBase(), ctx: ctxFalso() });
    expect(r.veredicto).toBe('listo');
    expect(r.resumen.fallas).toBe(0);
    expect(r.siguientesPasos).toEqual([]);
  });

  it('ejecuta los diez chequeos aunque algo falle', async () => {
    // Cortar en la primera falla esconderia el resto y obligaria a varias vueltas.
    const r = await runDoctor({ env: envBase({ plataforma: 'linux' }), ctx: ctxFalso() });
    expect(r.checks).toHaveLength(10);
  });

  it('todo chequeo que no esta en ok trae un siguiente paso concreto', async () => {
    const r = await runDoctor({
      env: envBase({
        plataforma: 'linux',
        nodeVersion: '16.20.0',
        detectExcel: async () => ({ encontrado: false, exePath: null, metodo: 'ninguno', version: null }),
        detectSession: async () => ({ sessionName: 'Services', sessionId: 0, interactiva: false, indicios: [] }),
        siigoProcesosActivos: async () => ['EXCEL.EXE'],
      }),
      ctx: ctxFalso({ config: { ...CONFIG_OK, defaultCredentials: undefined }, installations: [], companies: [] }),
    });

    for (const c of r.checks) {
      if (c.status === 'ok') continue;
      expect(c.siguientePaso, `${c.id} sin siguiente paso`).toBeTruthy();
      // Un consejo util nombra algo concreto: una ruta, un fichero, una variable, un comando
      // o una herramienta. "Verifique la instalacion" a secas no vale.
      expect(c.siguientePaso, `${c.id} da un consejo vago`).toMatch(
        /SIIGO_|siigo_|\\|https:|Node|net use|icacls|filepath\.txt|SIIWI|config\.json|Excel|EBADPLATFORM|Windows/,
      );
    }
  });

  it('fuera de Windows falla y lo marca bloqueante', async () => {
    const r = await runDoctor({ env: envBase({ plataforma: 'linux' }), ctx: ctxFalso() });
    expect(check(r, 'plataforma').status).toBe('falla');
    expect(check(r, 'plataforma').bloqueante).toBe(true);
    expect(r.veredicto).toBe('no-listo');
    expect(r.siguientesPasos[0]).toContain('Plataforma');
  });

  it('Node por debajo de 18 es bloqueante', async () => {
    const r = await runDoctor({ env: envBase({ nodeVersion: '16.20.0' }), ctx: ctxFalso() });
    expect(check(r, 'node').status).toBe('falla');
  });

  it('sin instalaciones remite al config.json y a la herramienta', async () => {
    const r = await runDoctor({ env: envBase(), ctx: ctxFalso({ installations: [] }) });
    const c = check(r, 'instalaciones');
    expect(c.status).toBe('falla');
    // Un agente pre-registro no tiene herramientas: hay que darle la ruta del fichero.
    expect(c.siguientePaso).toContain('config.json');
    expect(c.siguientePaso).toContain('siigo_add_installation');
  });

  it('sin Excel es bloqueante', async () => {
    const r = await runDoctor({
      env: envBase({ detectExcel: async () => ({ encontrado: false, exePath: null, metodo: 'ninguno', version: null }) }),
      ctx: ctxFalso(),
    });
    expect(check(r, 'excel').status).toBe('falla');
    expect(check(r, 'excel').bloqueante).toBe(true);
  });

  it('solo el ProgID de Excel es aviso, no falla', async () => {
    // El registro COM puede sobrevivir a una desinstalacion sucia: no basta para afirmar que si.
    const r = await runDoctor({
      env: envBase({
        detectExcel: async () => ({ encontrado: true, exePath: null, metodo: 'progid', version: 'Excel.Application.16' }),
      }),
      ctx: ctxFalso(),
    });
    expect(check(r, 'excel').status).toBe('aviso');
    expect(check(r, 'excel').bloqueante).toBe(false);
  });

  it('la sesion 0 es bloqueante', async () => {
    const r = await runDoctor({
      env: envBase({
        detectSession: async () => ({ sessionName: 'Services', sessionId: 0, interactiva: false, indicios: ['sesion 0'] }),
      }),
      ctx: ctxFalso(),
    });
    expect(check(r, 'sesion').status).toBe('falla');
  });

  it('RDP es aviso: hay escritorio pero se puede desconectar', async () => {
    const r = await runDoctor({
      env: envBase({
        detectSession: async () => ({ sessionName: 'RDP-Tcp#3', sessionId: 2, interactiva: true, indicios: ['sesion remota (RDP)'] }),
      }),
      ctx: ctxFalso(),
    });
    expect(check(r, 'sesion').status).toBe('aviso');
    expect(r.veredicto).toBe('listo-con-avisos');
  });

  it('una sesion indeterminable deja el veredicto indeterminado', async () => {
    const r = await runDoctor({
      env: envBase({ detectSession: async () => ({ sessionName: null, sessionId: null, interactiva: null, indicios: [] }) }),
      ctx: ctxFalso(),
    });
    expect(check(r, 'sesion').status).toBe('desconocido');
    expect(r.veredicto).toBe('indeterminado');
  });

  it('sin credenciales es bloqueante y dice las dos formas de darlas', async () => {
    const r = await runDoctor({
      env: envBase(),
      ctx: ctxFalso({ config: { ...CONFIG_OK, defaultCredentials: undefined } }),
    });
    const c = check(r, 'credenciales');
    expect(c.status).toBe('falla');
    expect(c.siguientePaso).toContain('SIIGO_USUARIO');
    expect(c.siguientePaso).toContain('defaultCredentials');
  });

  it('reconoce que las credenciales vienen del entorno', async () => {
    const r = await runDoctor({
      env: envBase({ env: { SIIGO_USUARIO: 'DELENV', SIIGO_CLAVE: 'x' } }),
      ctx: ctxFalso({ config: { ...CONFIG_OK, defaultCredentials: undefined } }),
    });
    expect(check(r, 'credenciales').status).toBe('ok');
    expect(check(r, 'credenciales').datos?.origen).toBe('entorno');
    expect(check(r, 'credenciales').datos?.usuario).toBe('DELENV');
  });

  it('avisa cuando SIIGO_ANO anula el anio configurado para una empresa', async () => {
    // Consultar el anio contable equivocado no se nota en la respuesta, asi que conviene decirlo.
    const r = await runDoctor({
      env: envBase({ env: { SIIGO_USUARIO: 'U', SIIGO_CLAVE: 'C', SIIGO_ANO: '2026' } }),
      ctx: ctxFalso({
        config: { ...CONFIG_OK, companies: { 'Z:\\SIIWI01\\': { year: '2025' } } },
      }),
    });
    const c = check(r, 'credenciales');
    expect(c.status).toBe('aviso');
    expect(c.datos?.anioDelEntornoAnulaEmpresa).toBe(true);
    expect(c.siguientePaso).toContain('anio');
  });

  it('no avisa cuando SIIGO_ANO coincide con el anio de la empresa', async () => {
    const r = await runDoctor({
      env: envBase({ env: { SIIGO_USUARIO: 'U', SIIGO_CLAVE: 'C', SIIGO_ANO: '2026' } }),
      ctx: ctxFalso({
        config: { ...CONFIG_OK, companies: { 'Z:\\SIIWI01\\': { year: '2026' } } },
      }),
    });
    expect(check(r, 'credenciales').status).toBe('ok');
  });

  it('una empresa inaccesible es aviso con el net use concreto', async () => {
    const r = await runDoctor({
      env: envBase(),
      ctx: ctxFalso({ companies: [{ ...EMPRESA, reachable: false }] }),
    });
    const c = check(r, 'empresas');
    expect(c.status).toBe('aviso');
    expect(c.siguientePaso).toContain('net use Z:');
  });

  it('una empresa con ruta demasiado larga es bloqueante', async () => {
    const r = await runDoctor({
      env: envBase(),
      ctx: ctxFalso({ companies: [{ ...EMPRESA, path: 'C:\\Empresas\\Contabilidad 2026\\Clientes\\SIIWI01\\' }] }),
    });
    expect(check(r, 'empresas').status).toBe('falla');
    expect(check(r, 'empresas').siguientePaso).toContain('50');
  });

  it('--sin-empresas deja el chequeo como desconocido, no como ok', async () => {
    const r = await runDoctor({ env: envBase(), ctx: ctxFalso(), incluirEmpresas: false });
    expect(check(r, 'empresas').status).toBe('desconocido');
  });

  it('una carpeta de salida sin margen es bloqueante', async () => {
    const r = await runDoctor({
      env: envBase(),
      ctx: ctxFalso({ config: { ...CONFIG_OK, outputDir: 'C:\\Users\\juan.perez\\Documents\\Exportes SIIGO' } }),
    });
    expect(check(r, 'salida').status).toBe('falla');
  });

  it('una carpeta de salida que no existe pero cuyo padre si es ok', async () => {
    // El runner la crea en el primer uso; exigir que exista antes seria un falso negativo.
    const r = await runDoctor({
      env: envBase({
        statFile: async (p) =>
          p === CONFIG_OK.outputDir
            ? { existe: false, esDir: false, mode: null }
            : { existe: true, esDir: true, mode: 0o700 },
      }),
      ctx: ctxFalso(),
    });
    expect(check(r, 'salida').status).toBe('ok');
    expect(check(r, 'salida').detalle).toContain('se creara');
  });

  it('procesos de SIIGO vivos son aviso', async () => {
    const r = await runDoctor({
      env: envBase({ siigoProcesosActivos: async () => ['EXCELSIIGO.exe'] }),
      ctx: ctxFalso(),
    });
    expect(check(r, 'concurrencia').status).toBe('aviso');
  });

  it('un chequeo que revienta no tumba el diagnostico', async () => {
    const r = await runDoctor({
      env: envBase({
        detectExcel: async () => {
          throw new Error('reg no respondio');
        },
      }),
      ctx: ctxFalso(),
    });
    expect(check(r, 'excel').status).toBe('desconocido');
    expect(check(r, 'excel').detalle).toContain('reg no respondio');
  });

  it('el primer siguiente paso es el que desbloquea', async () => {
    const r = await runDoctor({
      env: envBase({ siigoProcesosActivos: async () => ['EXCEL.EXE'] }),
      ctx: ctxFalso({ config: { ...CONFIG_OK, defaultCredentials: undefined } }),
    });
    // Hay un aviso (concurrencia) y una falla bloqueante (credenciales): manda la falla.
    expect(r.siguientesPasos[0]).toContain('Credenciales');
  });
});
