#!/usr/bin/env node
/**
 * Ejercita LAS 58 herramientas del perfil `all` contra una instalacion real de SIIGO.
 *
 *   $env:SIIGO_USUARIO='TU_USUARIO'; $env:SIIGO_CLAVE='TU_CLAVE'; node scripts/test-all-tools.mjs
 *
 * Que hace con cada grupo:
 *
 *   - 11 de apoyo: se invocan y se comprueba la forma de la respuesta (incluye siigo_start_here).
 *   - 29 GET*: se ejecutan DE VERDAD contra la empresa. Son de solo lectura: extraen a un
 *     .xlsx y no tocan la contabilidad.
 *   - 18 PUSH*: NO se ejecutan. Importan datos y modificarian la contabilidad de la
 *     empresa, algo que este script no puede deshacer. Se comprueba su ruta de validacion
 *     (archivo de entrada inexistente), que verifica el esquema, la resolucion de empresa
 *     y credenciales, y la construccion del argv sin llegar a lanzar el ejecutable.
 *
 * Las corridas son seriales porque el CLI de SIIGO no admite instancias simultaneas, asi
 * que el conjunto tarda. Durante la ejecucion se ven las ventanas de SIIGO y de Excel.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const usuario = process.env.SIIGO_USUARIO;
const clave = process.env.SIIGO_CLAVE;
const empresa = process.env.SIIGO_EMPRESA ?? '01';
const anio = process.env.SIIGO_ANO;

if (!usuario || !clave) {
  console.error('Faltan SIIGO_USUARIO y SIIGO_CLAVE en el entorno.');
  process.exit(1);
}

const configDir = mkdtempSync(path.join(tmpdir(), 'siigo-all-'));
writeFileSync(
  path.join(configDir, 'config.json'),
  JSON.stringify({
    installations: [],
    companies: {},
    outputDir: 'C:\\SiigoMCP\\all',
    norma: 'L',
    timeoutMs: 120000,
    defaultCredentials: { user: usuario, password: clave },
  }),
);

/** Parametros obligatorios (los que el catalogo no dota de valor por defecto). */
const REQUERIDOS = {
  GETMOV: { fechaInicial: '0101', fechaFinal: '1231' },
  GETMVT: { fechaInicial: '0101', fechaFinal: '1231' },
  GETEXT: { fechaInicial: '0101', fechaFinal: '1231' },
  GETMSRL: { fechaInicial: '0101', fechaFinal: '1231' },
  GETHN: { tipoNovedad: 'CC', modelo: '1', fechaInicial: '0101', fechaFinal: '1231' },
  GETNOV: { tipoNovedad: 'V' },
  GETINF: { tipoInforme: 'B' },
};

const META = [
  'siigo_start_here',
  'siigo_doctor',
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

const { SIIGO_USUARIO: _u, SIIGO_CLAVE: _c, ...limpio } = process.env;

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(process.cwd(), 'dist', 'index.js')],
  // Perfil `all`: el objetivo de este script es ejercitar UNA herramienta por funcion.
  env: { ...limpio, SIIGO_MCP_CONFIG_DIR: configDir, SIIGO_TOOLS: 'all' },
});

const client = new Client({ name: 'test-all', version: '1.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
const resultados = [];

function anota(herramienta, grupo, estado, detalle) {
  resultados.push({ herramienta, grupo, estado, detalle });
  const marca = estado === 'OK' ? 'ok  ' : estado === 'ESPERADO' ? 'ok* ' : 'FALLO';
  console.log(`${marca} ${herramienta.padEnd(24)} ${detalle}`);
}

async function llamar(name, args, opciones = {}) {
  return client.callTool(
    { name, arguments: args, _meta: { progressToken: name } },
    undefined,
    { timeout: opciones.timeout ?? 150_000, resetTimeoutOnProgress: true },
  );
}

function cuerpo(r) {
  try {
    return JSON.parse(r.content?.[0]?.text ?? '{}');
  } catch {
    return { _texto: r.content?.[0]?.text ?? '' };
  }
}

// ── 1. Herramientas de apoyo ─────────────────────────────────────────────────
console.log(`\n=== ${META.length} herramientas de apoyo ===`);

{
  const r = cuerpo(await llamar('siigo_start_here', {}));
  const ok = Array.isArray(r.protocolo) && r.protocolo.length > 0;
  anota('siigo_start_here', 'apoyo', ok ? 'OK' : 'FALLO', `${r.protocolo?.length} parrafo(s) de protocolo`);
}
{
  const r = cuerpo(await llamar('siigo_doctor', {}));
  // Un veredicto adverso seria un diagnostico correcto; lo que se comprueba es que responda
  // con la forma esperada y que no filtre la clave.
  const ok = typeof r.veredicto === 'string' && r.checks?.length === 10 && !JSON.stringify(r).includes(clave);
  anota('siigo_doctor', 'apoyo', ok ? 'OK' : 'FALLO', `veredicto=${r.veredicto}, ${r.checks?.length} chequeos`);
}
{
  const r = cuerpo(await llamar('siigo_list_installations', {}));
  const ok = r.total > 0 && r.instalaciones?.[0]?.ejecutable;
  anota('siigo_list_installations', 'apoyo', ok ? 'OK' : 'FALLO', `${r.total} instalacion(es)`);
}
{
  const r = cuerpo(await llamar('siigo_list_companies', {}));
  const e = r.empresas?.[0];
  anota('siigo_list_companies', 'apoyo', r.total > 0 && e?.accesible ? 'OK' : 'FALLO',
    `${r.total} empresa(s), primera ${e?.ruta} accesible=${e?.accesible}`);
}
{
  const r = cuerpo(await llamar('siigo_list_functions', {}));
  const f = cuerpo(await llamar('siigo_list_functions', { grupo: 'Inventarios' }));
  anota('siigo_list_functions', 'apoyo', r.total === 47 && f.total > 0 && f.total < 47 ? 'OK' : 'FALLO',
    `${r.total} funciones, ${f.total} en Inventarios`);
}
{
  const r = cuerpo(await llamar('siigo_describe_function', { funcion: 'GETMOV' }));
  const mal = cuerpo(await llamar('siigo_describe_function', { funcion: 'NOEXISTE' }));
  anota('siigo_describe_function', 'apoyo',
    r.parametros?.length === 14 && (mal._texto ?? '').includes('no existe') ? 'OK' : 'FALLO',
    `GETMOV con ${r.parametros?.length} parametros; funcion inexistente rechazada`);
}
{
  const r = cuerpo(await llamar('siigo_set_credentials', { usuario: 'PRUEBA', clave: '9999', empresa: 'Z:\\SIIWI99\\' }));
  anota('siigo_set_credentials', 'apoyo', r.guardado === true && !JSON.stringify(r).includes('9999') ? 'OK' : 'FALLO',
    'credencial por empresa guardada y clave no revelada');
}
{
  const r = cuerpo(await llamar('siigo_set_company_alias', { empresa: 'Z:\\SIIWI99\\', alias: 'PruebaAlias' }));
  anota('siigo_set_company_alias', 'apoyo', r.guardado === true ? 'OK' : 'FALLO', `alias=${r.alias}`);
}
{
  const r = await llamar('siigo_add_installation', { carpeta: 'C:\\NoExisteSiigo' });
  anota('siigo_add_installation', 'apoyo', r.isError === true ? 'ESPERADO' : 'FALLO',
    'carpeta sin EXCELSIIGO.exe rechazada');
}
{
  const r = cuerpo(await llamar('siigo_get_config', {}));
  const texto = JSON.stringify(r);
  anota('siigo_get_config', 'apoyo',
    r.credencialPorDefecto?.clave === '********' && !texto.includes(clave) ? 'OK' : 'FALLO',
    'claves enmascaradas');
}

// ── 2. Las 29 funciones de exportacion, ejecutadas de verdad ─────────────────
console.log('\n=== 29 funciones de exportacion (ejecucion real) ===');

const exportTools = tools
  .filter((t) => !META.includes(t.name))
  .map((t) => ({ tool: t.name, fn: t.name.replace('siigo_', '').toUpperCase() }))
  .filter((t) => t.fn.startsWith('GET'))
  .sort((a, b) => a.fn.localeCompare(b.fn));

let primerXlsx = null;

for (const { tool, fn } of exportTools) {
  const args = { empresa, filasPreview: 3, ...(anio ? { anio } : {}), ...(REQUERIDOS[fn] ?? {}) };
  const inicio = Date.now();
  try {
    const r = await llamar(tool, args);
    const b = cuerpo(r);
    const seg = Math.round((Date.now() - inicio) / 1000);
    if (b.ok === true) {
      primerXlsx ??= b.archivo;
      anota(tool, 'export', 'OK', `${seg}s, ${b.totalFilas} filas, ${b.columnas?.length} columnas`);
    } else if (b.moduloNoDisponible === true) {
      // La empresa no tiene ese modulo licenciado. El servidor lo detecto y lo explico:
      // es el comportamiento correcto, no un defecto que este script deba reportar.
      anota(tool, 'export', 'ESPERADO', `${seg}s, modulo no disponible en esta empresa`);
    } else {
      anota(tool, 'export', 'FALLO', `${seg}s, ${(b.problemas ?? []).join(' | ').slice(0, 160)}`);
    }
  } catch (err) {
    anota(tool, 'export', 'FALLO', `excepcion: ${String(err.message).slice(0, 160)}`);
  }
}

// siigo_read_xlsx se prueba sobre un archivo real ya generado.
if (primerXlsx) {
  const r = cuerpo(await llamar('siigo_read_xlsx', { ruta: primerXlsx, offset: 0, limite: 5 }));
  anota('siigo_read_xlsx', 'apoyo', Array.isArray(r.columnas) && r.columnas.length > 0 ? 'OK' : 'FALLO',
    `${r.totalFilas} filas, encabezado en la fila ${r.filaEncabezado}`);
} else {
  anota('siigo_read_xlsx', 'apoyo', 'FALLO', 'no hubo ningun xlsx generado que leer');
}

// ── 3. Las 18 funciones de importacion, solo por su ruta de validacion ───────
console.log('\n=== 18 funciones de importacion (validacion, SIN ejecutar) ===');

const importTools = tools
  .filter((t) => !META.includes(t.name))
  .map((t) => ({ tool: t.name, fn: t.name.replace('siigo_', '').toUpperCase() }))
  .filter((t) => t.fn.startsWith('PUSH'))
  .sort((a, b) => a.fn.localeCompare(b.fn));

for (const { tool } of importTools) {
  const r = await llamar(tool, { empresa, archivoEntrada: 'C:\\SiigoMCP\\no-existe.xlsx' });
  const texto = r.content?.[0]?.text ?? '';
  const bienRechazado = r.isError === true && /no existe/i.test(texto);
  anota(tool, 'import', bienRechazado ? 'ESPERADO' : 'FALLO', texto.replace(/\s+/g, ' ').slice(0, 110));
}

await client.close();

// ── Resumen ──────────────────────────────────────────────────────────────────
const fallos = resultados.filter((r) => r.estado === 'FALLO');
const porGrupo = (g) => resultados.filter((r) => r.grupo === g);

console.log('\n=== RESUMEN ===');
for (const g of ['apoyo', 'export', 'import']) {
  const rs = porGrupo(g);
  const mal = rs.filter((r) => r.estado === 'FALLO').length;
  const esperados = rs.filter((r) => r.estado === 'ESPERADO').length;
  const nota = esperados > 0 ? ` (${esperados} por la via esperada, marcadas ok*)` : '';
  console.log(`${g.padEnd(8)} ${rs.length - mal}/${rs.length} correctas${nota}`);
}

if (fallos.length > 0) {
  console.log('\nFallos:');
  for (const f of fallos) console.log(` - ${f.herramienta}: ${f.detalle}`);
  process.exit(1);
}

console.log(`\nTODAS OK: ${resultados.length} herramientas ejercitadas.`);
process.exit(0);
