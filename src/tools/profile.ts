/**
 * Perfil de herramientas expuestas.
 *
 * Por que existe: cada schema de herramienta cuesta del orden de cientos de tokens en CADA
 * llamada al modelo, mientras la herramienta este habilitada. Exponer las 47 funciones como
 * herramientas independientes sale por unos 34k tokens por llamada, mas que el toolset entero
 * de algunos clientes, y eso vuelve el servidor incomodo o inviable de instalar.
 *
 * `core` (por defecto) expone 11 herramientas: las de apoyo mas un despachador que ejecuta
 * cualquiera de las 47 funciones por nombre. `all` mantiene una herramienta por funcion para
 * quien ya llame `siigo_getmov` directamente.
 */

export type ToolProfile = 'core' | 'all';

export const DEFAULT_PROFILE: ToolProfile = 'core';

/** Lee `SIIGO_TOOLS`. Un valor no reconocido cae al perfil por defecto en vez de fallar. */
export function toolProfile(env: Record<string, string | undefined> = process.env): ToolProfile {
  const raw = env['SIIGO_TOOLS']?.trim().toLowerCase();
  return raw === 'all' ? 'all' : DEFAULT_PROFILE;
}
