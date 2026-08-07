import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readSheet } from './read.js';

let dir: string;
let file: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'siigo-xlsx-'));
  file = path.join(dir, 'terceros.xlsx');

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Terceros');
  // Encabezado con un titulo repetido, como hacen los modelos de SIIGO.
  ws.addRow(['NIT', 'Nombre', 'Valor', 'Valor']);
  for (let i = 1; i <= 120; i++) ws.addRow([i, `Tercero ${i}`, i * 10, i * 20]);
  await wb.xlsx.writeFile(file);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('readSheet', () => {
  it('devuelve la primera pagina y cuenta todas las filas', async () => {
    const page = await readSheet(file);
    expect(page.sheetName).toBe('Terceros');
    expect(page.rowCount).toBe(120);
    expect(page.rows).toHaveLength(50);
    expect(page.offset).toBe(0);
    expect(page.nextOffset).toBe(50);
    expect(page.rows[0]).toEqual({ NIT: 1, Nombre: 'Tercero 1', Valor: 10, Valor_1: 20 });
  });

  it('desambigua los encabezados repetidos', async () => {
    const page = await readSheet(file, { limit: 1 });
    expect(page.columns).toEqual(['NIT', 'Nombre', 'Valor', 'Valor_1']);
  });

  it('pagina con offset y cierra con nextOffset nulo', async () => {
    const page = await readSheet(file, { offset: 100, limit: 50 });
    expect(page.rows).toHaveLength(20);
    expect(page.rows[0]!.NIT).toBe(101);
    expect(page.nextOffset).toBeNull();
  });

  it('falla con un mensaje util si la hoja no existe', async () => {
    await expect(readSheet(file, { sheet: 'Inexistente' })).rejects.toThrow(/Hojas disponibles: Terceros/);
  });
});
