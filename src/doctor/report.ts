/**
 * Presentacion del diagnostico en consola.
 *
 * Reglas, todas verificadas por test:
 *  - Etiquetas de ancho fijo `[ ok ] [avis] [fall] [ ? ]`, para que la salida sea grepeable.
 *  - Sin tildes ni emojis: la consola de Windows suele estar en codepage 850 y los destroza.
 *  - Todo chequeo que no este en `ok` imprime su siguiente paso debajo, con sangria.
 *  - La ULTIMA linea es siempre `Siguiente paso:`, porque es lo que un agente lee con mas
 *    probabilidad cuando la salida se trunca por arriba.
 */
import type { CheckStatus, DoctorReport } from './types.js';

const ETIQUETA: Record<CheckStatus, string> = {
  ok: '[ ok ]',
  aviso: '[avis]',
  falla: '[fall]',
  desconocido: '[ ?  ]',
};

const VEREDICTO_TEXTO: Record<DoctorReport['veredicto'], string> = {
  listo: 'LISTO',
  'listo-con-avisos': 'LISTO CON AVISOS',
  'no-listo': 'NO LISTO',
  indeterminado: 'INDETERMINADO',
};

/** Ancho de la columna del titulo, para que los detalles queden alineados. */
const ANCHO_TITULO = 22;

export function formatReport(r: DoctorReport): string {
  const l: string[] = [];
  const { nombre, version, node, plataforma, arch, os } = r.servidor;

  l.push(`${nombre} ${version} - diagnostico`);
  l.push(`${plataforma} ${os} | Node ${node} | ${arch} | ${r.generadoEn}`);
  l.push('');

  for (const c of r.checks) {
    l.push(`${ETIQUETA[c.status]} ${c.titulo.padEnd(ANCHO_TITULO)}${c.detalle}`);
    if (c.status !== 'ok' && c.siguientePaso) {
      // La flecha marca el inicio del consejo; las continuaciones solo se sangran.
      envolver(c.siguientePaso, 104).forEach((linea, i) => l.push(`       ${i === 0 ? '->' : '  '} ${linea}`));
    }
  }

  l.push('');
  const partes = [
    r.resumen.fallas > 0 ? `${r.resumen.fallas} falla${r.resumen.fallas === 1 ? '' : 's'}` : null,
    r.resumen.avisos > 0 ? `${r.resumen.avisos} aviso${r.resumen.avisos === 1 ? '' : 's'}` : null,
    r.resumen.desconocidos > 0 ? `${r.resumen.desconocidos} sin determinar` : null,
  ].filter((p): p is string => p !== null);
  l.push(`Veredicto: ${VEREDICTO_TEXTO[r.veredicto]}${partes.length ? ` (${partes.join(', ')})` : ''}.`);

  // Invariante: la ultima linea siempre empieza por "Siguiente paso:".
  const primero = r.siguientesPasos[0];
  l.push(
    primero
      ? `Siguiente paso: ${primero}`
      : `Siguiente paso: nada pendiente. Registre el servidor en su cliente MCP con "npx -y ${nombre} --print-config".`,
  );

  return `${l.join('\n')}\n`;
}

/** 0 cuando el equipo puede trabajar; 1 cuando falta algo bloqueante. */
export function exitCodeFor(r: DoctorReport): number {
  return r.veredicto === 'no-listo' ? 1 : 0;
}

function envolver(texto: string, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of texto.split(' ')) {
    if (actual && actual.length + 1 + palabra.length > ancho) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = actual ? `${actual} ${palabra}` : palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}
