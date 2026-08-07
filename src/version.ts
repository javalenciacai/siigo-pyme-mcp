/**
 * Identidad del paquete, en un modulo propio.
 *
 * Vive separado de `server.ts` para que quien solo necesita el nombre y la version (la CLI, el
 * diagnostico, las herramientas) no arrastre el arbol de herramientas ni cree un ciclo de
 * imports: server -> tools -> doctor -> server.
 *
 * Se lee del package.json en vez de duplicarse aqui: al publicar se sube con `npm version`, y
 * una constante escrita a mano se queda atras sin que nada lo detecte. Se usa createRequire y
 * no un import de JSON para no arrastrar el package.json dentro de dist/ y alterar el rootDir.
 */
import { createRequire } from 'node:module';

const pkg = createRequire(import.meta.url)('../package.json') as { name: string; version: string };

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
