// Prueba end-to-end contra la instalacion real. Uso:
//   node scripts/e2e.mjs <usuario> <clave> [empresa]
// Sin argumentos usa credenciales invalidas a proposito, para validar la deteccion de error.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const usuario = process.argv[2] ?? 'NOEXISTE';
const clave = process.argv[3] ?? 'XXXXXXXX';
const empresa = process.argv[4] ?? '01';
const esperaFallo = process.argv[2] === undefined;

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
      defaultCredentials: { user: usuario, password: clave },
    },
    null,
    2,
  ),
);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(process.cwd(), 'dist', 'index.js')],
  env: { ...process.env, SIIGO_MCP_CONFIG_DIR: dir },
});

const client = new Client({ name: 'e2e', version: '1.0.0' });
await client.connect(transport);

console.log(`Ejecutando siigo_getter contra empresa ${empresa} con usuario "${usuario}"...`);
const started = Date.now();
const r = await client.callTool({
  name: 'siigo_getter',
  arguments: { empresa, conDatos: 'S', clasificacion: 'T', filasPreview: 5 },
});
console.log(`(${Math.round((Date.now() - started) / 1000)} s)`);
console.log('isError:', r.isError === true);
console.log(r.content[0].text.slice(0, 4000));

await client.close();

if (esperaFallo && r.isError !== true) {
  console.error('\nFALLO DE LA PRUEBA: con credenciales invalidas el servidor deberia reportar error.');
  process.exit(1);
}
