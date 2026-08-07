/**
 * Pruebas de los parsers de salidas de Windows.
 *
 * Nunca invocan `reg` ni `tasklist`: las entradas son salidas literales capturadas, en espanol y
 * en ingles, para que estos tests corran igual en CI sobre Linux.
 */
import { describe, expect, it } from 'vitest';
import { parseRegDefaultValue, parseRegValue, parseTasklistCsvRow } from './windows.js';

describe('parseTasklistCsvRow', () => {
  it('lee una fila en espanol', () => {
    const stdout = '"node.exe","28416","Console","1","62.104 KB"\r\n';
    expect(parseTasklistCsvRow(stdout)).toEqual(['node.exe', '28416', 'Console', '1', '62.104 KB']);
  });

  it('lee una fila en ingles', () => {
    const stdout = '"node.exe","28416","Services","0","62,104 K"\r\n';
    // Se parsea por posicion, no por nombre de columna: los encabezados cambian de idioma.
    expect(parseTasklistCsvRow(stdout)?.[3]).toBe('0');
  });

  it('salta las lineas de aviso previas', () => {
    const stdout = 'INFORMACION: no hay tareas.\r\n"node.exe","1","Console","2","1 KB"\r\n';
    expect(parseTasklistCsvRow(stdout)?.[0]).toBe('node.exe');
  });

  it('devuelve null si no hay ninguna fila', () => {
    expect(parseTasklistCsvRow('')).toBeNull();
    expect(parseTasklistCsvRow('INFORMACION: no se encuentra ningun proceso.\r\n')).toBeNull();
  });
});

describe('parseRegDefaultValue', () => {
  it('lee el valor por defecto en espanol', () => {
    const stdout = [
      '',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\excel.exe',
      '    (Predeterminado)    REG_SZ    C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE',
      '',
    ].join('\r\n');
    expect(parseRegDefaultValue(stdout)).toBe('C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE');
  });

  it('lee el valor por defecto en ingles', () => {
    // Se ancla en el tipo REG_SZ, que es invariante, y no en "(Default)"/"(Predeterminado)".
    const stdout = '\r\nHKEY_LOCAL_MACHINE\\...\r\n    (Default)    REG_SZ    C:\\Office\\EXCEL.EXE\r\n';
    expect(parseRegDefaultValue(stdout)).toBe('C:\\Office\\EXCEL.EXE');
  });

  it('acepta REG_EXPAND_SZ', () => {
    const stdout = '    (Predeterminado)    REG_EXPAND_SZ    %ProgramFiles%\\Office\\EXCEL.EXE\r\n';
    expect(parseRegDefaultValue(stdout)).toBe('%ProgramFiles%\\Office\\EXCEL.EXE');
  });

  it('devuelve null cuando la clave no existe', () => {
    expect(parseRegDefaultValue('ERROR: El sistema no pudo encontrar la clave del Registro.')).toBeNull();
    expect(parseRegDefaultValue('')).toBeNull();
  });
});

describe('parseRegValue', () => {
  it('lee un valor con nombre', () => {
    const stdout = '    Path    REG_SZ    C:\\Office\\\r\n    Otro    REG_SZ    x\r\n';
    expect(parseRegValue(stdout, 'Path')).toBe('C:\\Office\\');
  });

  it('devuelve null si el nombre no aparece', () => {
    expect(parseRegValue('    Path    REG_SZ    C:\\Office\\\r\n', 'Version')).toBeNull();
  });
});
