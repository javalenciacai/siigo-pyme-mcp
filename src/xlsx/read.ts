/**
 * Lectura paginada de los `.xlsx` que genera SIIGO.
 *
 * Un `GETMOV` de un anio completo puede traer decenas de miles de filas; devolverlas todas
 * inundaria el contexto del agente. Por eso siempre se lee una ventana y se informa
 * `nextOffset` para continuar.
 */
import ExcelJS from 'exceljs';

export interface ReadOptions {
  /** Hoja a leer: nombre o indice 1-based. Por defecto la primera. */
  sheet?: string | number;
  /** Fila de datos desde la que empezar, 0-based (sin contar el encabezado). */
  offset?: number;
  /** Maximo de filas a devolver. */
  limit?: number;
}

export interface SheetPage {
  sheetName: string;
  sheetNames: string[];
  columns: string[];
  /** Total de filas de datos de la hoja, sin contar el encabezado. */
  rowCount: number;
  offset: number;
  rows: Record<string, string | number | boolean | null>[];
  /** Offset de la siguiente pagina, o null si ya se llego al final. */
  nextOffset: number | null;
}

export const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/** Convierte una celda de ExcelJS a un valor JSON plano. */
function cellValue(value: ExcelJS.CellValue): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return cellValue(value.result as ExcelJS.CellValue);
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join('');
    }
    if ('error' in value) return String(value.error);
  }
  return String(value);
}

/** Encabezado legible; las columnas sin titulo quedan como `col3`, `col4`... */
function headerNames(row: ExcelJS.Row, width: number): string[] {
  const names: string[] = [];
  const seen = new Map<string, number>();

  for (let c = 1; c <= width; c++) {
    const raw = cellValue(row.getCell(c).value);
    let name = raw === null ? '' : String(raw).trim();
    if (name.length === 0) name = `col${c}`;

    // Los modelos de SIIGO repiten titulos (por ejemplo varias columnas "Valor").
    const previous = seen.get(name);
    if (previous !== undefined) {
      seen.set(name, previous + 1);
      name = `${name}_${previous + 1}`;
    } else {
      seen.set(name, 0);
    }
    names.push(name);
  }
  return names;
}

export async function readSheet(filePath: string, options: ReadOptions = {}): Promise<SheetPage> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheetNames = workbook.worksheets.map((w) => w.name);
  const worksheet =
    options.sheet === undefined
      ? workbook.worksheets[0]
      : typeof options.sheet === 'number'
        ? workbook.worksheets[options.sheet - 1]
        : workbook.getWorksheet(options.sheet);

  if (!worksheet) {
    throw new Error(
      `La hoja ${JSON.stringify(options.sheet)} no existe en "${filePath}". Hojas disponibles: ${sheetNames.join(', ')}.`,
    );
  }

  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

  const width = worksheet.actualColumnCount || worksheet.columnCount;
  const headerRow = worksheet.getRow(1);
  const columns = headerNames(headerRow, width);

  // La fila 1 es el encabezado, asi que las filas de datos empiezan en la 2.
  const rowCount = Math.max(0, worksheet.rowCount - 1);
  const firstDataRow = 2 + offset;
  const lastDataRow = Math.min(worksheet.rowCount, firstDataRow + limit - 1);

  const rows: Record<string, string | number | boolean | null>[] = [];
  for (let r = firstDataRow; r <= lastDataRow; r++) {
    const row = worksheet.getRow(r);
    const record: Record<string, string | number | boolean | null> = {};
    let empty = true;
    for (let c = 1; c <= width; c++) {
      const value = cellValue(row.getCell(c).value);
      record[columns[c - 1]!] = value;
      if (value !== null && value !== '') empty = false;
    }
    if (!empty) rows.push(record);
  }

  const consumed = offset + (lastDataRow - firstDataRow + 1);
  return {
    sheetName: worksheet.name,
    sheetNames,
    columns,
    rowCount,
    offset,
    rows,
    nextOffset: consumed < rowCount ? consumed : null,
  };
}
