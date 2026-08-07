/**
 * Contrato del despachador `siigo_run_function`.
 *
 * Lo que importa fijar: que produzca EXACTAMENTE el mismo argv que la herramienta dedicada
 * equivalente (si no, el perfil `core` daria resultados distintos que el perfil `all`), y que la
 * proteccion de las importaciones, que al colapsar 47 herramientas en una deja de ser implicita,
 * sea real.
 */
import { describe, expect, it } from 'vitest';
import { findFunction } from '../catalog/functions.js';
import { buildArgv } from '../siigo/args.js';
import { buscar, resolverLlamada } from './dispatch.js';

const COMUN = {
  companyPath: 'Z:\\SIIWI01\\',
  year: '2026',
  norma: 'L' as const,
  user: 'USUARIO',
  password: 'CLAVE',
  logPath: 'Z:\\SIIWI01\\LOGS\\mcp0001.log',
};

describe('buscar', () => {
  it('encuentra la funcion sin distinguir mayusculas', () => {
    expect(buscar('getmov')?.name).toBe('GETMOV');
    expect(buscar('  GetMov  ')?.name).toBe('GETMOV');
  });

  it('devuelve undefined si no existe', () => {
    expect(buscar('NOEXISTE')).toBeUndefined();
  });
});

describe('resolverLlamada', () => {
  // El runner calcula la ruta del .xlsx antes de llamar a buildArgv; aqui se pasa a mano
  // porque estamos comparando la construccion del argv, no la resolucion de rutas.
  const SALIDA = { archivoSalida: 'C:\\SiigoMCP\\out\\GETTER-0001.xlsx' };

  it('construye el mismo argv que la herramienta dedicada', () => {
    const fn = findFunction('GETTER');
    if (!fn) throw new Error('GETTER no esta en el catalogo');

    const r = resolverLlamada({ funcion: 'getter', empresa: '01', params: {} });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // El argv por el camino del despachador y el de la herramienta dedicada, lado a lado.
    const porDespachador = buildArgv(fn, COMUN, { ...r.entrada, ...SALIDA });
    const porHerramienta = buildArgv(fn, COMUN, { ...SALIDA });
    expect(porDespachador.argv).toEqual(porHerramienta.argv);
    expect(porDespachador.resolved).toEqual(porHerramienta.resolved);
  });

  it('pasa los parametros propios al argv', () => {
    const fn = findFunction('GETMOV');
    if (!fn) throw new Error('GETMOV no esta en el catalogo');

    const r = resolverLlamada({ funcion: 'GETMOV', empresa: '01', params: { fechaInicial: '0101', fechaFinal: '1231' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { argv } = buildArgv(fn, COMUN, { ...r.entrada, archivoSalida: 'C:\\SiigoMCP\\out\\GETMOV-0001.xlsx' });
    expect(argv).toContain('0101');
    expect(argv).toContain('1231');
  });

  it('no deja los campos internos filtrarse a los parametros de la funcion', () => {
    const r = resolverLlamada({ funcion: 'GETTER', empresa: '01', params: {} });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entrada).not.toHaveProperty('funcion');
    expect(r.entrada).not.toHaveProperty('params');
    expect(r.entrada).not.toHaveProperty('confirmarEscritura');
    expect(r.entrada.empresa).toBe('01');
  });

  it('rechaza una funcion que no existe y remite al catalogo', () => {
    const r = resolverLlamada({ funcion: 'GETNADA', empresa: '01' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('siigo_list_functions');
  });

  it('rechaza una importacion sin confirmarEscritura', () => {
    // Sin esto, colapsar las 47 herramientas en una eliminaria la unica senal de que un PUSH*
    // escribe en la contabilidad.
    const r = resolverLlamada({ funcion: 'PUSHTER', empresa: '01', params: { archivoEntrada: 'C:\\x.xlsx' } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('confirmarEscritura=true');
    expect(r.error).toContain('ESCRIBE');
  });

  it('acepta una importacion con confirmarEscritura en true', () => {
    const r = resolverLlamada({
      funcion: 'PUSHTER',
      empresa: '01',
      confirmarEscritura: true,
      params: { archivoEntrada: 'C:\\x.xlsx' },
    });
    expect(r.ok).toBe(true);
  });

  it('no exige confirmacion a una exportacion', () => {
    expect(resolverLlamada({ funcion: 'GETTER', empresa: '01' }).ok).toBe(true);
  });

  it('rechaza un parametro con formato invalido y apunta a describe_function', () => {
    const r = resolverLlamada({ funcion: 'GETMOV', empresa: '01', params: { fechaInicial: 'ayer' } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('siigo_describe_function("GETMOV")');
  });
});
