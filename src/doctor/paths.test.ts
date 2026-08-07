/**
 * Fija la aritmetica del limite de 50 caracteres contra el catalogo real.
 *
 * Si alguien anade una funcion con un nombre mas largo, o cambia el patron de nombres del
 * runner, estos tests avisan antes de que el CLI empiece a truncar rutas en silencio.
 */
import { describe, expect, it } from 'vitest';
import { MAX_PATH_ARG } from '../siigo/args.js';
import { logPathHeadroom, longestGeneratedFileName, outputHeadroom } from './paths.js';

describe('longestGeneratedFileName', () => {
  it('sale del catalogo y usa el patron del runner', () => {
    const { nombre, largo } = longestGeneratedFileName();
    expect(largo).toBe(nombre.length);
    expect(nombre).toMatch(/^[A-Z0-9]+-.{4}(-err)?\.xlsx$/);
  });

  it('deja sitio para una carpeta de salida usable', () => {
    // Si el nombre generado se comiera casi los 50 caracteres, no cabria ninguna carpeta.
    expect(longestGeneratedFileName().largo).toBeLessThan(30);
  });
});

describe('outputHeadroom', () => {
  it('acepta la carpeta corta por defecto', () => {
    const r = outputHeadroom('C:\\SiigoMCP\\out');
    expect(r.ok).toBe(true);
    expect(r.margen).toBeGreaterThan(0);
    expect(r.limite).toBe(MAX_PATH_ARG);
  });

  it('rechaza una carpeta larga, y dice cuanto se pasa', () => {
    const r = outputHeadroom('C:\\Users\\juan.perez\\Documents\\Exportes de SIIGO 2026');
    expect(r.ok).toBe(false);
    expect(r.margen).toBeLessThan(0);
    expect(r.archivoMasLargo.length).toBeGreaterThan(0);
  });
});

describe('logPathHeadroom', () => {
  it('acepta una empresa montada en la raiz de una unidad', () => {
    const r = logPathHeadroom('Z:\\SIIWI01\\');
    expect(r.ok).toBe(true);
    expect(r.ruta).toMatch(/LOGS/);
  });

  it('rechaza una empresa anidada en una ruta larga', () => {
    expect(logPathHeadroom('C:\\Empresas\\Contabilidad 2026\\Clientes\\SIIWI01\\').ok).toBe(false);
  });
});
