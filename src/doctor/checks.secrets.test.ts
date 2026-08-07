/**
 * Garantia de que el diagnostico nunca filtra una clave de SIIGO.
 *
 * El informe se serializa entero (incluido `datos` de cada chequeo, el texto legible y los
 * siguientes pasos) y se busca la clave dentro. Es la unica prueba que separa "no la imprimimos
 * a proposito" de "no la imprimimos, comprobado".
 */
import { describe, expect, it } from 'vitest';
import type { SiigoContext } from '../context.js';
import type { SiigoConfig } from '../config/store.js';
import { runDoctor } from './checks.js';
import { formatReport } from './report.js';
import type { DoctorEnv } from './types.js';

const CLAVE_ENTORNO = 'ZZTOPSECRET1';
const CLAVE_CONFIG = 'ZZOTRACLAVE2';

const config: SiigoConfig = {
  installations: [],
  companies: { 'Z:\\SIIWI01\\': { user: 'PEPE', password: CLAVE_CONFIG, year: '2026' } },
  outputDir: 'C:\\SiigoMCP\\out',
  norma: 'L',
  timeoutMs: 180_000,
  defaultCredentials: { user: 'ADMIN', password: CLAVE_CONFIG },
};

const env: DoctorEnv = {
  plataforma: 'win32',
  nodeVersion: '22.19.0',
  arch: 'x64',
  osRelease: '10.0.19045',
  env: { SIIGO_USUARIO: 'PEPE', SIIGO_CLAVE: CLAVE_ENTORNO, SIIGO_ANO: '2026' },
  detectExcel: async () => ({ encontrado: true, exePath: 'C:\\Office\\EXCEL.EXE', metodo: 'app-paths', version: 'Office16' }),
  detectSession: async () => ({ sessionName: 'Console', sessionId: 1, interactiva: true, indicios: [] }),
  siigoProcesosActivos: async () => [],
  statFile: async () => ({ existe: true, esDir: true, mode: 0o600 }),
  escribible: async () => true,
};

const ctx = {
  config: async () => config,
  installations: async () => [
    { dir: 'C:\\Siigo', exePath: 'C:\\Siigo\\EXCELSIIGO.exe', version: '10.1', source: 'registry' as const, filePath: null },
  ],
  companies: async () => [
    {
      path: 'Z:\\SIIWI01\\',
      number: '01',
      alias: 'Uno',
      installations: ['C:\\Siigo'],
      declared: true,
      hasCredentials: true,
      reachable: true,
    },
  ],
  invalidate: () => undefined,
} as unknown as SiigoContext;

describe('el diagnostico no filtra claves', () => {
  it('ni en el JSON ni en el texto legible', async () => {
    const informe = await runDoctor({ env, ctx });
    const serializado = `${JSON.stringify(informe)}\n${formatReport(informe)}`;

    expect(serializado).not.toContain(CLAVE_ENTORNO);
    expect(serializado).not.toContain(CLAVE_CONFIG);
  });

  it('del entorno solo informa si la clave esta definida, no su valor', async () => {
    const informe = await runDoctor({ env, ctx });
    const cfg = informe.checks.find((c) => c.id === 'config');
    expect(cfg?.datos?.claveEnEntorno).toBe(true);
    expect(cfg?.datos?.variablesDefinidas).not.toContain('SIIGO_CLAVE');
  });

  it('el usuario si se muestra, porque no es secreto y ayuda a diagnosticar', async () => {
    const informe = await runDoctor({ env, ctx });
    expect(informe.checks.find((c) => c.id === 'credenciales')?.datos?.usuario).toBe('PEPE');
  });
});
