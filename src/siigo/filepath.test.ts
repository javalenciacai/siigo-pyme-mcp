import { describe, expect, it } from 'vitest';
import { parseFilePath } from './filepath.js';

describe('parseFilePath', () => {
  it('lee el formato real de SIIGO con UNC', () => {
    const info = parseFilePath('Z:\\SIIWI01\\::\\\\127.0.0.1\\inmunotek::');
    expect(info).toEqual({
      companyPath: 'Z:\\SIIWI01\\',
      companyNumber: '01',
      unc: '\\\\127.0.0.1\\inmunotek',
      shareName: 'inmunotek',
      raw: 'Z:\\SIIWI01\\::\\\\127.0.0.1\\inmunotek::',
    });
  });

  it('agrega el backslash final si falta', () => {
    expect(parseFilePath('C:\\SIIWI03')?.companyPath).toBe('C:\\SIIWI03\\');
  });

  it('tolera la ausencia de UNC', () => {
    const info = parseFilePath('C:\\SIIWI01\\');
    expect(info?.unc).toBeNull();
    expect(info?.shareName).toBeNull();
    expect(info?.companyNumber).toBe('01');
  });

  it('descarta contenido vacio', () => {
    expect(parseFilePath('')).toBeNull();
    expect(parseFilePath('   \r\n')).toBeNull();
    expect(parseFilePath('::algo::')).toBeNull();
  });
});
