/**
 * Fuente unica del texto de ayuda.
 *
 * Lo consumen `--help` (src/cli.ts) y el recurso MCP `siigo://guia/inicio`. Tener una sola
 * copia evita que la ayuda de la consola y la que ve un agente se desincronicen.
 *
 * Se escribe sin tildes a proposito: la consola de Windows suele estar en codepage 850 u 437
 * y destroza los acentos. El resto del repo sigue la misma convencion en las cadenas de codigo.
 */

export interface GuiaContexto {
  nombre: string;
  version: string;
}

/** Requisitos del equipo, en una sola lista reutilizable. */
export const REQUISITOS: string[] = [
  'Windows. El paquete declara os: ["win32"] porque SIIGO Pyme solo existe en Windows.',
  'SIIGO Pyme instalado, con EXCELSIIGO.exe. Por defecto en C:\\Siigo, pero se detectan otras rutas.',
  'Microsoft Excel instalado. SIIGO genera los .xlsx con Excel por COM: sin Excel no se produce ningun archivo.',
  'Sesion de escritorio activa. No funciona como servicio de Windows, ni por SSH sin sesion, ni en un contenedor.'
    + ' Durante cada ejecucion se ven las ventanas de SIIGO y de Excel: es normal, y no se pueden ocultar'
    + ' (con la ventana oculta el proceso se cuelga sin generar nada).',
  'Rutas de hasta 50 caracteres. El CLI trunca mas alla de ese limite, tanto el .xlsx de salida como el log.',
];

/** Variables de entorno que lee el servidor. */
export const VARIABLES: { nombre: string; texto: string }[] = [
  { nombre: 'SIIGO_USUARIO', texto: 'Usuario de SIIGO, hasta 8 caracteres.' },
  { nombre: 'SIIGO_CLAVE', texto: 'Clave del usuario, hasta 8 caracteres.' },
  { nombre: 'SIIGO_ANO', texto: 'Anio de proceso por defecto, 4 digitos. Por defecto el anio actual.' },
  { nombre: 'SIIGO_TOOLS', texto: 'core (por defecto) expone 12 herramientas; all expone las 58.' },
  { nombre: 'SIIGO_MCP_CONFIG_DIR', texto: 'Carpeta de la configuracion. Por defecto %APPDATA%\\siigo-pyme-mcp.' },
];

/** Fallos de instalacion frecuentes, con su causa real. */
export const FALLOS_DE_INSTALACION: { sintoma: string; causa: string }[] = [
  {
    sintoma: 'npm error EBADPLATFORM ... wanted {"os":"win32"}',
    causa:
      'Se esta instalando fuera de Windows (WSL, contenedor, Linux). El servidor tiene que registrarse en la'
      + ' maquina Windows donde esta SIIGO. --force no ayuda: sin SIIGO ni Excel no hay nada que ejecutar.',
  },
  {
    sintoma: 'El cliente MCP dice que el servidor no arranco, sin mas detalle.',
    causa:
      'Falta el -y en npx. Sin el, npx pide confirmacion por consola y se queda esperando; el cliente lee ese'
      + ' silencio como un arranque fallido. Use siempre: npx -y siigo-pyme-mcp',
  },
  {
    sintoma: "'npx' no se reconoce como un comando, o ENOENT al lanzar el servidor.",
    causa:
      'El cliente MCP no tiene npx en su PATH. Use el bloque que imprime --print-config --absoluto, que apunta'
      + ' directamente a node.exe y al dist/index.js instalado.',
  },
  {
    sintoma: 'El servidor arranca pero toda funcion falla sin generar archivo.',
    causa: 'Falta Excel, falta la sesion de escritorio, o alguna ruta pasa de 50 caracteres. Ejecute --doctor.',
  },
];

export function guiaInicio(ctx: GuiaContexto): string {
  const l: string[] = [];
  const npx = `npx -y ${ctx.nombre}`;

  l.push(`${ctx.nombre} ${ctx.version} - SIIGO Pyme como herramientas MCP.`);
  l.push('Opera EXCELSIIGO.exe, el CLI de interfaces de SIIGO Pyme: exporta a .xlsx e importa desde .xlsx.');
  l.push('Solo Windows, y solo en un equipo con SIIGO Pyme y Microsoft Excel instalados.');
  l.push('');

  l.push('USO');
  l.push(`  ${npx}                      habla MCP por stdio. Es el modo que usa el cliente.`);
  l.push(`  ${npx} --doctor             comprueba que el equipo pueda ejecutar SIIGO.`);
  l.push(`  ${npx} --print-config       imprime el bloque de configuracion a pegar en el cliente.`);
  l.push(`  ${npx} --print-agent-rules  imprime el protocolo de uso para pegar en las reglas del agente.`);
  l.push(`  ${npx} --help               esta ayuda.`);
  l.push(`  ${npx} --version            la version instalada.`);
  l.push('');
  l.push('  Sin argumentos NO es para ejecutar a mano: se queda en silencio esperando mensajes MCP');
  l.push('  por su entrada estandar. Ese silencio es lo correcto, no un fallo.');
  l.push('');
  l.push('  --doctor acepta --json (informe completo, apto para maquina) y --sin-empresas (mas rapido,');
  l.push('  omite el escaneo de discos). Termina con codigo 0, o 1 si el veredicto es NO LISTO.');
  l.push('  --print-config acepta --cliente <hermes|claude-desktop|claude-code|vscode|cursor>, --absoluto');
  l.push('  (sin npx) y --json.');
  l.push('  --print-agent-rules acepta --cliente, --json y --instalar (escribe el fichero de reglas en la');
  l.push('  carpeta del cliente cuando se conoce una; --forzar para reemplazar uno existente distinto).');
  l.push('');

  l.push('INSTALACION EN 4 PASOS');
  l.push(`  1. ${npx} --doctor`);
  l.push('     Resuelva lo que salga como [fall]. Cada falla dice exactamente que hacer.');
  l.push(`  2. ${npx} --print-config --cliente <su cliente>`);
  l.push('     Pegue el bloque en el fichero que indica la salida y reinicie el cliente MCP.');
  l.push(`  3. ${npx} --print-agent-rules --cliente <su cliente>`);
  l.push('     Registrar el servidor no basta para que el agente sepa usarlo: varios clientes MCP');
  l.push('     descartan las instrucciones que manda el servidor al conectar. Instale este bloque en la');
  l.push('     capa de reglas del cliente (skill, AGENTS.md, instrucciones del proyecto).');
  l.push('  4. Vuelva a ejecutar --doctor, o llame a la herramienta siigo_doctor desde el agente,');
  l.push('     para confirmar que el veredicto es LISTO.');
  l.push('');

  l.push('REQUISITOS');
  for (const r of REQUISITOS) l.push(...envolver(r, '  - ', '    '));
  l.push('');

  l.push('VARIABLES DE ENTORNO (todas opcionales)');
  for (const v of VARIABLES) l.push(`  ${v.nombre.padEnd(22)}${v.texto}`);
  l.push('  Las credenciales tambien se pueden guardar con la herramienta siigo_set_credentials.');
  l.push('');

  l.push('SI LA INSTALACION FALLA');
  for (const f of FALLOS_DE_INSTALACION) {
    l.push(`  ${f.sintoma}`);
    l.push(...envolver(f.causa, '    ', '    '));
  }
  l.push('');

  l.push('Repositorio e incidencias: https://github.com/javalenciacai/siigo-pyme-mcp');

  return `${l.join('\n')}\n`;
}

/** Parte un texto largo en lineas de <= 96 caracteres, con sangrias distintas para la primera. */
function envolver(texto: string, prefijo: string, sangria: string): string[] {
  const ancho = 96;
  const palabras = texto.split(' ');
  const lineas: string[] = [];
  let actual = prefijo;
  let vacia = true;

  for (const palabra of palabras) {
    if (!vacia && actual.length + 1 + palabra.length > ancho) {
      lineas.push(actual);
      actual = sangria + palabra;
    } else {
      actual = vacia ? actual + palabra : `${actual} ${palabra}`;
      vacia = false;
    }
  }
  if (!vacia) lineas.push(actual);
  return lineas;
}
