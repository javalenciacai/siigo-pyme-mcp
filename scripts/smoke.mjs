#!/usr/bin/env node
/**
 * Smoke test del servidor MCP por stdio.
 *
 * Levanta `dist/index.js` una vez por perfil de herramientas y verifica que:
 *   1. El servidor se identifica como `siigo-pyme-mcp`.
 *   2. El perfil `core` expone 11 herramientas (las de apoyo mas el despachador) y el perfil
 *      `all` expone las 47 de funcion mas las de apoyo. El recuento es el contrato que
 *      mantiene el coste en tokens bajo control.
 *   3. El esquema generado para una funcion trae sus parametros y los campos comunes.
 *   4. `siigo_describe_function` responde con la firma del manual.
 *   5. `siigo_doctor` emite un veredicto sin ejecutar nada de SIIGO.
 *   6. `--doctor --json` termina sin excepcion e imprime un informe parseable.
 *
 * No ejecuta EXCELSIIGO.exe ni toca ninguna empresa: solo valida el contrato MCP, asi que
 * corre igual en CI, donde no hay SIIGO instalado.
 *
 * Exit 0 si todo pasa, 1 si algo falla.
 */
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, '..', 'dist', 'index.js');

const FUNCTION_TOOLS = 47;
const META_TOOLS = [
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
const DISPATCH_TOOL = 'siigo_run_function';

/** Cuantas herramientas debe exponer cada perfil. */
const ESPERADO = {
  core: META_TOOLS.length + 1,
  all: META_TOOLS.length + FUNCTION_TOOLS,
};

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

function nuevoCliente(profile) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    env: { ...process.env, SIIGO_MCP_CONFIG_DIR: configDir, SIIGO_TOOLS: profile },
  });
  return { client: new Client({ name: 'smoke', version: '1.0.0' }), transport };
}

/** Comprobaciones comunes a los dos perfiles. */
async function verificarPerfil(profile) {
  console.log(`\n--- perfil ${profile} ---`);
  const { client, transport } = nuevoCliente(profile);

  try {
    await client.connect(transport);

    const info = client.getServerVersion();
    check(info?.name === 'siigo-pyme-mcp', `serverInfo.name es siigo-pyme-mcp (fue "${info?.name}")`);

    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));

    check(
      tools.length === ESPERADO[profile],
      `${profile}: tools/list devolvio ${ESPERADO[profile]} herramientas (fueron ${tools.length})`,
    );

    const missingMeta = META_TOOLS.filter((n) => !names.has(n));
    check(
      missingMeta.length === 0,
      `${profile}: estan las ${META_TOOLS.length} herramientas de apoyo (faltan: ${missingMeta.join(', ') || 'ninguna'})`,
    );

    // El despachador y las herramientas por funcion son mutuamente excluyentes: si aparecieran
    // los dos, el coste en tokens seria el de `all` mas uno, sin ganar nada.
    check(
      names.has(DISPATCH_TOOL) === (profile === 'core'),
      `${profile}: ${DISPATCH_TOOL} ${profile === 'core' ? 'esta presente' : 'no esta presente'}`,
    );
    check(
      names.has('siigo_getmov') === (profile === 'all'),
      `${profile}: siigo_getmov ${profile === 'all' ? 'esta presente' : 'no esta presente'}`,
    );

    const sinDescripcion = tools.filter((t) => !t.description || t.description.length < 20).map((t) => t.name);
    check(
      sinDescripcion.length === 0,
      `${profile}: todas describen que hacen (sin descripcion: ${sinDescripcion.join(', ') || 'ninguna'})`,
    );

    const conParametros = profile === 'all' ? tools.find((t) => t.name === 'siigo_getmov') : tools.find((t) => t.name === DISPATCH_TOOL);
    if (conParametros) {
      const props = Object.keys(conParametros.inputSchema.properties ?? {});
      const esperados = profile === 'all'
        ? ['empresa', 'anio', 'norma', 'fechaInicial', 'fechaFinal', 'cuentaInicial']
        : ['empresa', 'anio', 'norma', 'funcion', 'params', 'confirmarEscritura'];
      for (const field of esperados) {
        check(props.includes(field), `${profile}: ${conParametros.name} declara "${field}"`);
      }
      check(
        (conParametros.inputSchema.required ?? []).includes('empresa'),
        `${profile}: ${conParametros.name} exige "empresa"`,
      );
    }

    const described = await client.callTool({ name: 'siigo_describe_function', arguments: { funcion: 'GETTER' } });
    const payload = JSON.parse(described.content[0].text);
    check(payload.funcion === 'GETTER', `${profile}: siigo_describe_function responde para GETTER`);
    check(payload.parametros?.length === 7, `${profile}: GETTER declara 7 parametros (declaro ${payload.parametros?.length})`);
    check(
      typeof payload.ejemploDelManual === 'string' && payload.ejemploDelManual.includes('GETTER'),
      `${profile}: siigo_describe_function incluye el ejemplo del manual`,
    );

    // El diagnostico se omite el descubrimiento de empresas para no escanear discos en CI.
    const doctor = await client.callTool({ name: 'siigo_doctor', arguments: { incluirEmpresas: false } });
    const informe = JSON.parse(doctor.content[0].text);
    check(typeof informe.veredicto === 'string', `${profile}: siigo_doctor emite un veredicto`);
    check(Array.isArray(informe.checks) && informe.checks.length === 10, `${profile}: siigo_doctor corre los 10 chequeos`);
    // Un veredicto adverso es un diagnostico correcto, no un fallo de la herramienta.
    check(doctor.isError !== true, `${profile}: siigo_doctor no se marca como error`);

    const { resources } = await client.listResources();
    check(
      resources.some((r) => r.uri === 'siigo://guia/inicio'),
      `${profile}: resources/list incluye siigo://guia/inicio`,
    );
    const guia = await client.readResource({ uri: 'siigo://guia/inicio' });
    check(
      (guia.contents[0]?.text ?? '').includes('INSTALACION EN 3 PASOS'),
      `${profile}: la guia se puede leer y trae los pasos de instalacion`,
    );
    const firma = await client.readResource({ uri: 'siigo://funcion/GETTER' });
    check(
      (firma.contents[0]?.text ?? '').includes('GETTER'),
      `${profile}: la plantilla siigo://funcion/{nombre} responde para GETTER`,
    );

    const { prompts } = await client.listPrompts();
    check(prompts.length === 1, `${profile}: prompts/list devuelve 1 prompt (fueron ${prompts.length})`);
    check(prompts[0]?.name === 'siigo_puesta_en_marcha', `${profile}: el prompt es siigo_puesta_en_marcha`);

    await client.close();
  } catch (err) {
    console.log(`\n[smoke] error en el perfil ${profile}: ${err?.stack ?? err}`);
    failures.push(`${profile}: ${err?.message ?? err}`);
    try {
      await client.close();
    } catch {
      /* el transporte ya podia estar cerrado */
    }
  }
}

/** El subcomando `--doctor --json`, que es la superficie que un agente usa ANTES de registrar nada. */
async function verificarDoctorCli() {
  console.log('\n--- subcomando --doctor --json ---');
  const ejecutar = promisify(execFile);
  let stdout = '';
  let stderr = '';
  let code = 0;

  try {
    const r = await ejecutar(process.execPath, [entry, '--doctor', '--json', '--sin-empresas'], {
      env: { ...process.env, SIIGO_MCP_CONFIG_DIR: configDir },
      maxBuffer: 8 * 1024 * 1024,
    });
    stdout = r.stdout;
    stderr = r.stderr;
  } catch (err) {
    // Exit 1 es legitimo: significa "no listo". En Linux siempre lo sera, por la plataforma.
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
    code = err.code ?? 1;
  }

  check(code === 0 || code === 1, `--doctor termina con 0 o 1 (fue ${code})`);
  check(!/\n\s+at /.test(stderr), 'no imprime un stack trace en stderr');

  let informe = null;
  try {
    informe = JSON.parse(stdout);
  } catch {
    /* se reporta abajo */
  }
  check(informe !== null, '--doctor --json imprime JSON parseable');
  if (informe) {
    // veredicto y siguientesPasos van primero para sobrevivir a un truncado por el cliente.
    check(Object.keys(informe)[0] === 'veredicto', 'la primera clave del informe es "veredicto"');
    check(Array.isArray(informe.siguientesPasos), 'el informe trae siguientesPasos');
    if (process.platform !== 'win32') {
      check(informe.veredicto === 'no-listo', 'fuera de Windows el veredicto es no-listo');
      check(informe.checks[0]?.id === 'plataforma', 'la primera falla es la plataforma');
    }
  }
}

console.log(`Servidor: ${entry}`);
await verificarPerfil('core');
await verificarPerfil('all');
await verificarDoctorCli();

if (failures.length > 0) {
  console.log(`\n[smoke] FALLO: ${failures.length} comprobacion(es) no pasaron.`);
  process.exit(1);
}

console.log(`\n[smoke] OK: core expone ${ESPERADO.core} herramientas y all expone ${ESPERADO.all}.`);
process.exit(0);
