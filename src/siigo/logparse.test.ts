import { describe, expect, it } from 'vitest';
import { parseLogText } from './logparse.js';

describe('parseLogText', () => {
  it('reconoce el codigo 081 y lo explica', () => {
    const r = parseLogText('081 Parametros de la funcion GET tienen errores\n');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('081');
    expect(r.errors[0]).toContain('orden o formato del argv');
  });

  it('reconoce el codigo 002', () => {
    const r = parseLogText('002 Nombre de Funcion no definida en ExcelSiigo');
    expect(r.errors[0]).toContain('Nombre de funcion no definido');
  });

  it('no marca error en un log informativo', () => {
    const r = parseLogText('000 Proceso iniciado\nRegistros procesados: 1240\n');
    expect(r.errors).toEqual([]);
    expect(r.lines).toBe(2);
  });

  it('detecta mensajes de error sin codigo', () => {
    const r = parseLogText('El archivo de datos no existe - C:\\SIIWI01\\x.xlsx');
    expect(r.errors).toHaveLength(1);
  });

  it('un log vacio no genera errores pero tampoco lineas', () => {
    const r = parseLogText('');
    expect(r.errors).toEqual([]);
    expect(r.lines).toBe(0);
  });

  it('recorta la cola a 20 lineas', () => {
    const r = parseLogText(Array.from({ length: 50 }, (_, i) => `linea ${i}`).join('\n'));
    expect(r.tail).toHaveLength(20);
    expect(r.tail.at(-1)).toBe('linea 49');
  });
});
