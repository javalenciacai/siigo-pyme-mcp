import { describe, expect, it } from 'vitest';
import { SiigoContext } from '../context.js';
import { conProtocolo } from './preamble.js';

describe('conProtocolo', () => {
  it('anade el protocolo al final la primera vez, sin tocar content[0]', () => {
    // content[0] es el contrato que ya asumen los consumidores (scripts/smoke.mjs hace
    // JSON.parse(resultado.content[0].text)); el preambulo no puede desplazarlo.
    const ctx = new SiigoContext();
    const r = conProtocolo(ctx, { content: [{ type: 'text' as const, text: 'hola' }] });
    expect(r.content).toHaveLength(2);
    expect(r.content[0]?.text).toBe('hola');
    expect(r.content[1]?.text).toContain('PROTOCOLO DEL SERVIDOR');
  });

  it('no lo repite en llamadas siguientes del mismo contexto', () => {
    const ctx = new SiigoContext();
    conProtocolo(ctx, { content: [{ type: 'text' as const, text: 'primera' }] });
    const segunda = conProtocolo(ctx, { content: [{ type: 'text' as const, text: 'segunda' }] });
    expect(segunda.content).toHaveLength(1);
    expect(segunda.content[0]?.text).toBe('segunda');
  });

  it('invalidate() no reinicia el flag: cambiar credenciales no repite el protocolo', () => {
    const ctx = new SiigoContext();
    conProtocolo(ctx, { content: [{ type: 'text' as const, text: 'primera' }] });
    ctx.invalidate();
    const segunda = conProtocolo(ctx, { content: [{ type: 'text' as const, text: 'segunda' }] });
    expect(segunda.content).toHaveLength(1);
  });

  it('preserva otros campos del resultado (isError)', () => {
    const ctx = new SiigoContext();
    const r = conProtocolo(ctx, { isError: true, content: [{ type: 'text' as const, text: 'fallo' }] });
    expect(r.isError).toBe(true);
  });
});
