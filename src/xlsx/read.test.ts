import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readSheet } from './read.js';

let dir: string;
let file: string;
let siigoFile: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'siigo-xlsx-'));
  file = path.join(dir, 'terceros.xlsx');
  siigoFile = path.join(dir, 'modelo-siigo.xlsx');

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Terceros');
  // Encabezado con un titulo repetido, como hacen los modelos de SIIGO.
  ws.addRow(['NIT', 'Nombre', 'Valor', 'Valor']);
  for (let i = 1; i <= 120; i++) ws.addRow([i, `Tercero ${i}`, i * 10, i * 20]);
  await wb.xlsx.writeFile(file);

  // Estructura real de un modelo de SIIGO, tomada de un GETTER contra una empresa viva:
  // banner de la empresa combinado en la fila 1, nombre del modelo en la 2, dos filas
  // vacias, encabezados en la 5 y datos desde la 6, con relleno de espacios de COBOL.
  const wb2 = new ExcelJS.Workbook();
  const ws2 = wb2.addWorksheet('Hoja1');
  ws2.addRow(Array(4).fill('INMUNOTEK COLOMBIA SAS'));
  ws2.addRow(Array(4).fill('MODELO TERCEROS'));
  ws2.addRow([]);
  ws2.addRow([]);
  ws2.addRow(['IDENTIFICACION', 'SUCURSAL', 'NOMBRE', 'PRIMER NOMBRE']);
  ws2.addRow(['1', '0', 'VENDEDOR/COBRADOR      ', 'OTONIEL               ']);
  ws2.addRow(['4588754', '0', 'GIRALDO BUSTAMANTE     ', 'OTONIEL               ']);
  await wb2.xlsx.writeFile(siigoFile);
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

describe('readSheet con el formato real de SIIGO', () => {
  it('salta el banner de la empresa y toma los encabezados de la fila 5', async () => {
    const page = await readSheet(siigoFile);
    expect(page.headerRow).toBe(5);
    expect(page.columns).toEqual(['IDENTIFICACION', 'SUCURSAL', 'NOMBRE', 'PRIMER NOMBRE']);
  });

  it('cuenta solo las filas de datos, no el banner', async () => {
    const page = await readSheet(siigoFile);
    expect(page.rowCount).toBe(2);
    expect(page.rows).toHaveLength(2);
    expect(page.nextOffset).toBeNull();
  });

  it('recorta el relleno de espacios que trae COBOL', async () => {
    const page = await readSheet(siigoFile);
    expect(page.rows[0]).toEqual({
      IDENTIFICACION: '1',
      SUCURSAL: '0',
      NOMBRE: 'VENDEDOR/COBRADOR',
      'PRIMER NOMBRE': 'OTONIEL',
    });
  });

  it('permite forzar la fila de encabezado', async () => {
    const page = await readSheet(siigoFile, { headerRow: 2 });
    expect(page.headerRow).toBe(2);
    // Con la fila 2 como encabezado, el banner repetido se desambigua por sufijo.
    expect(page.columns[0]).toBe('MODELO TERCEROS');
    expect(page.columns[1]).toBe('MODELO TERCEROS_1');
  });
});
