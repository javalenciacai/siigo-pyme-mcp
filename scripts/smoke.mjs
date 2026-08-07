#!/usr/bin/env node
/**
 * Smoke test del servidor MCP por stdio.
 *
 * Levanta `dist/index.js`, completa el handshake y verifica que:
 *   1. El servidor se identifica como `siigo-pyme-mcp`.
 *   2. Expone las 47 herramientas de funcion mas las 9 de apoyo.
 *   3. El esquema generado para una funcion trae sus parametros y los campos comunes.
 *   4. `siigo_describe_function` responde con la firma del manual.
 *
 * No ejecuta EXCELSIIGO.exe ni toca ninguna empresa: solo valida el contrato MCP, asi que
 * corre igual en CI, donde no hay SIIGO instalado.
 *
 * Exit 0 si todo pasa, 1 si algo falla.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, '..', 'dist', 'index.js');

const FUNCTION_TOOLS = 47;
const META_TOOLS = [
  'siigo_list_installations',
  'siigo_list_companies',
  'siigo_list_functions',
  'siigo_describe_function',
  'siigo_set_credentials',
  'siigo_set_company_alias',
  'siigo_add_installation',
  'siigo_get_config',
  'siigo_read_xlsx',
];
const TOTAL_TOOLS = FUNCTION_TOOLS + META_TOOLS.length;

const failures = [];

function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    failures.push(message);
  }
}

// Un config aislado evita leer el del usuario y hace el resultado reproducible en CI.
const configDir = path.join(here, '..', '.smoke-config');

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entry],
  env: { ...process.env, SIIGO_MCP_CONFIG_DIR: configDir },
});

const client = new Client({ name: 'smoke', version: '1.0.0' });

try {
  console.log(`Servidor: ${entry}\n`);
  await client.connect(transport);

  const info = client.getServerVersion();
  check(info?.name === 'siigo-pyme-mcp', `serverInfo.name es siigo-pyme-mcp (fue "${info?.name}")`);

  const { tools } = await client.listTools();
  const names = new Set(tools.map((t) => t.name));

  check(tools.length === TOTAL_TOOLS, `tools/list devolvio ${TOTAL_TOOLS} herramientas (fueron ${tools.length})`);

  const missingMeta = META_TOOLS.filter((n) => !names.has(n));
  check(missingMeta.length === 0, `estan las 9 herramientas de apoyo (faltan: ${missingMeta.join(', ') || 'ninguna'})`);

  const functionTools = tools.filter((t) => !META_TOOLS.includes(t.name));
  check(
    functionTools.length === FUNCTION_TOOLS,
    `hay ${FUNCTION_TOOLS} herramientas de funcion (fueron ${functionTools.length})`,
  );

  const sinDescripcion = tools.filter((t) => !t.description || t.description.length < 20).map((t) => t.name);
  check(sinDescripcion.length === 0, `todas las herramientas describen que hacen (sin descripcion: ${sinDescripcion.join(', ') || 'ninguna'})`);

  const getmov = tools.find((t) => t.name === 'siigo_getmov');
  check(getmov !== undefined, 'existe siigo_getmov');
  if (getmov) {
    const props = Object.keys(getmov.inputSchema.properties ?? {});
    for (const field of ['empresa', 'anio', 'norma', 'fechaInicial', 'fechaFinal', 'cuentaInicial']) {
      check(props.includes(field), `siigo_getmov declara el parametro "${field}"`);
    }
    check(
      (getmov.inputSchema.required ?? []).includes('empresa'),
      'siigo_getmov exige "empresa"',
    );
  }

  const described = await client.callTool({ name: 'siigo_describe_function', arguments: { funcion: 'GETTER' } });
  const payload = JSON.parse(described.content[0].text);
  check(payload.funcion === 'GETTER', 'siigo_describe_function responde para GETTER');
  check(payload.parametros?.length === 7, `GETTER declara 7 parametros (declaro ${payload.parametros?.length})`);
  check(
    typeof payload.ejemploDelManual === 'string' && payload.ejemploDelManual.includes('GETTER'),
    'siigo_describe_function incluye el ejemplo del manual',
  );

  await client.close();
} catch (err) {
  console.log(`\n[smoke] error: ${err?.stack ?? err}`);
  failures.push(String(err?.message ?? err));
  try {
    await client.close();
  } catch {
    /* el transporte ya podia estar cerrado */
  }
}

if (failures.length > 0) {
  console.log(`\n[smoke] FALLO: ${failures.length} comprobacion(es) no pasaron.`);
  process.exit(1);
}

console.log(`\n[smoke] OK: tools/list devolvio ${TOTAL_TOOLS} herramientas.`);
process.exit(0);
