// Prueba end-to-end contra la instalacion real.
//
// Prueba positiva (necesita credenciales validas de SIIGO), por variables de entorno:
//   $env:SIIGO_USUARIO='TU_USUARIO'; $env:SIIGO_CLAVE='TU_CLAVE'; node scripts/e2e.mjs
// o por argumentos:
//   node scripts/e2e.mjs <usuario> <clave> [empresa]
//
// Prueba negativa: sin credenciales por ningun lado usa unas invalidas a proposito y exige
// que el servidor reporte el fallo. Es la que corre sin configuracion.
//
// La empresa se puede fijar con SIIGO_EMPRESA o con el tercer argumento (por defecto 01).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const usuario = process.argv[2] ?? process.env.SIIGO_USUARIO;
const clave = process.argv[3] ?? process.env.SIIGO_CLAVE;
const empresa = process.argv[4] ?? process.env.SIIGO_EMPRESA ?? '01';

// Sin credenciales se corre la prueba negativa: se exige que el fallo se reporte como
// fallo, que es justo lo que el binario no hace por su cuenta (sale con codigo 0).
const modo = usuario && clave ? 'positiva' : 'negativa';
const user = usuario ?? 'NOEXISTE';
const pass = clave ?? 'XXXXXXXX';

const dir = mkdtempSync(path.join(tmpdir(), 'siigo-e2e-'));
writeFileSync(
  path.join(dir, 'config.json'),
  JSON.stringify(
    {
      installations: [],
      companies: {},
      outputDir: 'C:\\SiigoMCP\\e2e',
      norma: 'L',
      timeoutMs: 120000,
      defaultCredentials: { user, password: pass },
    },
    null,
    2,
  ),
);

// SIIGO_USUARIO/SIIGO_CLAVE del entorno pisarian el config de esta prueba; se quitan para
// que la credencial la decida solo este script.
const { SIIGO_USUARIO: _u, SIIGO_CLAVE: _c, ...limpio } = process.env;

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(process.cwd(), 'dist', 'index.js')],
  // Perfil `all`: este script invoca las herramientas por su nombre (siigo_getter), no el despachador.
  env: { ...limpio, SIIGO_MCP_CONFIG_DIR: dir, SIIGO_TOOLS: 'all' },
});

const client = new Client({ name: 'e2e', version: '1.0.0' });
await client.connect(transport);

console.log(`Prueba ${modo}: siigo_getter contra la empresa ${empresa} con el usuario "${user}"...`);
const started = Date.now();
const r = await client.callTool(
  {
    name: 'siigo_getter',
    arguments: { empresa, conDatos: 'S', clasificacion: 'T', filasPreview: 5 },
    // El servidor puede tardar hasta timeoutMs; el cliente debe esperar mas que el, o
    // aborta antes y deja el diagnostico a medias.
    _meta: { progressToken: 'e2e' },
  },
  undefined,
  { timeout: 150_000, resetTimeoutOnProgress: true },
);
console.log(`(${Math.round((Date.now() - started) / 1000)} s)`);
console.log('isError:', r.isError === true);
console.log(r.content[0].text.slice(0, 4000));

await client.close();

const payload = JSON.parse(r.content[0].text ?? '{}');

if (modo === 'negativa') {
  if (r.isError !== true) {
    console.error('\nFALLO: con credenciales invalidas el servidor deberia reportar error, no exito silencioso.');
    process.exit(1);
  }
  console.log('\nOK: el fallo se reporto como fallo.');
  process.exit(0);
}

// Prueba positiva: el archivo debe existir, pesar algo y traer filas legibles.
const problemas = [];
if (payload.ok !== true) problemas.push(`ok es ${payload.ok}: ${(payload.problemas ?? []).join(' | ')}`);
if (!payload.archivo) problemas.push('no se reporto la ruta del xlsx');
if (!(payload.bytes > 0)) problemas.push(`el xlsx pesa ${payload.bytes} bytes`);
if (!Array.isArray(payload.columnas) || payload.columnas.length === 0) problemas.push('no se leyeron columnas');
if (!Array.isArray(payload.filas)) problemas.push('no se leyeron filas');

if (problemas.length > 0) {
  console.error(`\nFALLO:\n - ${problemas.join('\n - ')}`);
  process.exit(1);
}

console.log(
  `\nOK: ${payload.totalFilas} filas en ${payload.columnas.length} columnas -> ${payload.archivo} (${payload.bytes} bytes)`,
);
process.exit(0);
