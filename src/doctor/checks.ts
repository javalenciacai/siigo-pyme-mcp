/**
 * Los diez chequeos del diagnostico.
 *
 * Se ejecutan TODOS, siempre, de mas barato a mas caro: cortar en la primera falla esconderia
 * el resto y obligaria a varias vueltas. Nada de aqui ejecuta `EXCELSIIGO.exe`, lanza Excel ni
 * escribe un solo archivo: es seguro llamarlo en cualquier momento.
 */
import os from 'node:os';
import path from 'node:path';
import { SiigoContext } from '../context.js';
import { configPath, type SiigoConfig } from '../config/store.js';
import { EXE_NAME, type Company, type Installation } from '../siigo/discovery.js';
import { realEnv } from './env.js';
import { logPathHeadroom, outputHeadroom } from './paths.js';
import type { CheckResult, CheckStatus, DoctorEnv, DoctorOptions, DoctorReport, Veredicto } from './types.js';
import { SERVER_NAME, SERVER_VERSION } from '../version.js';

const NODE_MINIMO = 18;

/** Acumulador que cronometra cada chequeo y obliga a dar un siguiente paso cuando algo no esta bien. */
class Acumulador {
  readonly checks: CheckResult[] = [];

  async add(
    id: CheckResult['id'],
    titulo: string,
    fn: () => Promise<Omit<CheckResult, 'id' | 'titulo' | 'ms'>>,
  ): Promise<CheckResult> {
    const t0 = Date.now();
    let base: Omit<CheckResult, 'id' | 'titulo' | 'ms'>;
    try {
      base = await fn();
    } catch (err) {
      // Un chequeo que revienta es un chequeo desconocido, nunca un diagnostico caido.
      base = {
        status: 'desconocido',
        detalle: `El chequeo fallo: ${(err as Error).message}`,
        siguientePaso: 'Reintente; si persiste, abra una incidencia con esta salida.',
        bloqueante: false,
      };
    }
    if (base.status !== 'ok' && !base.siguientePaso) {
      throw new Error(`El chequeo "${id}" no dio un siguiente paso pese a estar en "${base.status}".`);
    }
    const r: CheckResult = { id, titulo, ms: Date.now() - t0, ...base };
    this.checks.push(r);
    return r;
  }
}

export async function runDoctor(o: DoctorOptions = {}): Promise<DoctorReport> {
  const env: DoctorEnv = o.env ?? realEnv();
  const incluirEmpresas = o.incluirEmpresas ?? true;
  const ctx = o.ctx ?? new SiigoContext();
  const a = new Acumulador();

  // 1. Plataforma.
  await a.add('plataforma', 'Plataforma', async () => {
    if (env.plataforma === 'win32') {
      return { status: 'ok' as CheckStatus, detalle: `Windows ${env.osRelease} (${env.arch}).`, bloqueante: false };
    }
    return {
      status: 'falla' as CheckStatus,
      detalle: `La plataforma es "${env.plataforma}", y SIIGO Pyme solo existe en Windows.`,
      siguientePaso:
        'Registre el servidor en la maquina Windows donde esta instalado SIIGO, no en WSL, Linux ni un contenedor.'
        + ' El paquete declara os: ["win32"], asi que npm rechazara la instalacion con EBADPLATFORM; --force no ayuda.',
      bloqueante: true,
      datos: { plataforma: env.plataforma },
    };
  });

  // 2. Node.
  await a.add('node', 'Node', async () => {
    const mayor = Number.parseInt(env.nodeVersion.split('.')[0] ?? '0', 10);
    if (mayor >= NODE_MINIMO) {
      return { status: 'ok' as CheckStatus, detalle: `${env.nodeVersion} (se requiere >= ${NODE_MINIMO}).`, bloqueante: false };
    }
    return {
      status: 'falla' as CheckStatus,
      detalle: `Node ${env.nodeVersion}, y se requiere ${NODE_MINIMO} o superior.`,
      siguientePaso: `Actualice Node a la version ${NODE_MINIMO} o superior desde https://nodejs.org y reintente.`,
      bloqueante: true,
      datos: { node: env.nodeVersion, minimo: NODE_MINIMO },
    };
  });

  const config = await ctx.config();

  // 3. Instalaciones de SIIGO.
  let instalaciones: Installation[] = [];
  await a.add('instalaciones', 'Instalaciones SIIGO', async () => {
    instalaciones = await ctx.installations();
    if (instalaciones.length === 0) {
      return {
        status: 'falla' as CheckStatus,
        detalle: `No se encontro ninguna carpeta con ${EXE_NAME} (registro de Windows, configuracion ni escaneo de discos).`,
        siguientePaso:
          `Anada la carpeta de la instalacion al array "installations" de ${configPath()} (por ejemplo "D:\\\\Siigo"),`
          + ' o, si el servidor ya esta registrado, use la herramienta siigo_add_installation.',
        bloqueante: true,
        datos: { total: 0 },
      };
    }
    const detalles = instalaciones.map((i) => `${i.dir} (${i.source}${i.version ? `, version ${i.version}` : ''})`);
    return {
      status: 'ok' as CheckStatus,
      detalle: `${instalaciones.length} encontrada${instalaciones.length === 1 ? '' : 's'}: ${detalles.join('; ')}.`,
      bloqueante: false,
      datos: {
        total: instalaciones.length,
        instalaciones: instalaciones.map((i) => ({
          carpeta: i.dir,
          ejecutable: i.exePath,
          version: i.version,
          origen: i.source,
          empresaDeclarada: i.filePath?.companyPath ?? null,
        })),
      },
    };
  });

  // 4. Excel.
  await a.add('excel', 'Microsoft Excel', async () => {
    const excel = await env.detectExcel();
    const datos = { encontrado: excel.encontrado, metodo: excel.metodo, exePath: excel.exePath, version: excel.version };

    if (excel.metodo === 'app-paths' || excel.metodo === 'ruta-conocida') {
      return { status: 'ok' as CheckStatus, detalle: `${excel.exePath} (${excel.metodo}).`, bloqueante: false, datos };
    }
    if (excel.metodo === 'progid') {
      // El ProgID puede sobrevivir a una desinstalacion sucia: existe el registro COM pero no el exe.
      return {
        status: 'aviso' as CheckStatus,
        detalle: `Esta registrado el ProgID COM Excel.Application (${excel.version}), pero no se encontro EXCEL.EXE en disco.`,
        siguientePaso:
          'Abra Excel una vez a mano para confirmar que funciona. Si no abre, reinstale o repare Microsoft Office:'
          + ' SIIGO genera los .xlsx con Excel por COM y sin el no produce ningun archivo.',
        bloqueante: false,
        datos,
      };
    }
    return {
      status: 'falla' as CheckStatus,
      detalle: 'No se encontro Microsoft Excel ni por registro ni en las rutas habituales de Office.',
      siguientePaso:
        'Instale Microsoft Excel en este equipo. SIIGO delega la generacion del .xlsx a SiigoExcel.exe, que usa Excel'
        + ' por COM: sin Excel las funciones terminan sin generar nada.',
      bloqueante: true,
      datos,
    };
  });

  // 5. Sesion de escritorio.
  await a.add('sesion', 'Sesion de escritorio', async () => {
    const s = await env.detectSession();
    const datos = { sessionName: s.sessionName, sessionId: s.sessionId, interactiva: s.interactiva, indicios: s.indicios };
    const donde = `Sesion ${s.sessionId ?? '?'}${s.sessionName ? ` "${s.sessionName}"` : ''}`;

    if (s.interactiva === false) {
      return {
        status: 'falla' as CheckStatus,
        detalle: `${donde}: sin escritorio. ${s.indicios.join('; ')}.`,
        siguientePaso:
          'Ejecute el cliente MCP desde una sesion de escritorio abierta con un usuario que haya iniciado sesion.'
          + ' No funciona como servicio de Windows, ni por SSH sin sesion, ni en un contenedor.',
        bloqueante: true,
        datos,
      };
    }
    if (s.interactiva === null) {
      return {
        status: 'desconocido' as CheckStatus,
        detalle: `No se pudo determinar la sesion. ${s.indicios.join('; ') || 'tasklist no respondio'}.`,
        siguientePaso:
          'Confirme a mano que hay un escritorio abierto: durante una ejecucion deben verse las ventanas de SIIGO'
          + ' y de Excel. Si no se ven, no hay sesion utilizable.',
        bloqueante: false,
        datos,
      };
    }
    if (s.indicios.length > 0) {
      return {
        status: 'aviso' as CheckStatus,
        detalle: `${donde}: hay escritorio, con reservas. ${s.indicios.join('; ')}.`,
        siguientePaso:
          'Mantenga la sesion conectada mientras se ejecutan funciones: si se desconecta, Excel por COM deja de'
          + ' responder y la funcion termina sin generar archivo.',
        bloqueante: false,
        datos,
      };
    }
    return { status: 'ok' as CheckStatus, detalle: `${donde}: escritorio disponible.`, bloqueante: false, datos };
  });

  // 6. Configuracion.
  await a.add('config', 'Configuracion', async () => {
    const ruta = configPath();
    const st = await env.statFile(ruta);
    const definidas = ['SIIGO_USUARIO', 'SIIGO_ANO', 'SIIGO_TOOLS', 'SIIGO_MCP_CONFIG_DIR']
      .filter((k) => Boolean(env.env[k]));
    // De la clave solo se reporta si esta definida; nunca su valor.
    const datos = {
      archivo: ruta,
      existe: st.existe,
      permisos: st.mode === null ? null : st.mode.toString(8),
      variablesDefinidas: definidas,
      claveEnEntorno: Boolean(env.env['SIIGO_CLAVE']),
      carpetaDeSalida: config.outputDir,
      norma: config.norma,
      timeoutSegundos: Math.round(config.timeoutMs / 1000),
    };

    if (!st.existe) {
      // No es una falla: el servidor funciona solo con variables de entorno.
      return {
        status: 'aviso' as CheckStatus,
        detalle: `No existe ${ruta}; se usan los valores por defecto.`,
        siguientePaso:
          'No hace falta crearlo a mano: se escribe solo al usar siigo_set_credentials. Si prefiere no guardar nada'
          + ' en disco, defina SIIGO_USUARIO y SIIGO_CLAVE en el entorno del cliente MCP.',
        bloqueante: false,
        datos,
      };
    }
    if (st.mode !== null && (st.mode & 0o077) !== 0) {
      return {
        status: 'aviso' as CheckStatus,
        detalle: `${ruta} tiene permisos ${st.mode.toString(8)} y guarda credenciales.`,
        siguientePaso: `Restrinja el acceso al archivo a su usuario: icacls "${ruta}" /inheritance:r /grant:r "%USERNAME%:F"`,
        bloqueante: false,
        datos,
      };
    }
    return { status: 'ok' as CheckStatus, detalle: `${ruta} (permisos ${st.mode?.toString(8) ?? 'n/d'}).`, bloqueante: false, datos };
  });

  // 7. Credenciales.
  let empresas: Company[] = [];
  await a.add('credenciales', 'Credenciales', async () => {
    if (incluirEmpresas) empresas = await ctx.companies();
    const origen = origenDeCredenciales(config, env);
    const conCredenciales = empresas.filter((c) => c.hasCredentials).length;
    const datos = {
      origen,
      usuario: usuarioVisible(config, env),
      empresasConCredenciales: conCredenciales,
      empresasTotales: empresas.length,
      anioDelEntornoAnulaEmpresa: anioDelEntornoAnulaEmpresa(config, env),
    };

    if (origen === 'ninguno') {
      return {
        status: 'falla' as CheckStatus,
        detalle: 'No hay usuario ni clave resolubles para ninguna empresa.',
        siguientePaso:
          'Defina SIIGO_USUARIO y SIIGO_CLAVE en el bloque "env" del cliente MCP, o anada'
          + ` "defaultCredentials": {"user":"...","password":"..."} a ${configPath()}.`,
        bloqueante: true,
        datos,
      };
    }
    if (datos.anioDelEntornoAnulaEmpresa) {
      // No es un fallo, pero si una sorpresa caras: el anio global manda sobre el de la empresa,
      // y consultar el anio contable equivocado no se nota en la respuesta.
      return {
        status: 'aviso' as CheckStatus,
        detalle:
          `Credenciales resueltas por ${origen}. SIIGO_ANO=${env.env['SIIGO_ANO']} anula el anio configurado`
          + ' para al menos una empresa, porque el entorno tiene mas precedencia.',
        siguientePaso:
          `Si alguna empresa debe trabajar en otro anio, pase "anio" en la llamada, o quite SIIGO_ANO del entorno`
          + ` y deje el campo "year" de cada empresa en ${configPath()}.`,
        bloqueante: false,
        datos,
      };
    }
    return {
      status: 'ok' as CheckStatus,
      detalle: `Usuario "${datos.usuario}" resuelto por ${origen}.`,
      bloqueante: false,
      datos,
    };
  });

  // 8. Empresas.
  await a.add('empresas', 'Empresas', async () => {
    if (!incluirEmpresas) {
      return {
        status: 'desconocido' as CheckStatus,
        detalle: 'Omitido por --sin-empresas.',
        siguientePaso: 'Ejecute el diagnostico sin --sin-empresas para revisar las empresas y su accesibilidad.',
        bloqueante: false,
      };
    }
    const inaccesibles = empresas.filter((c) => !c.reachable);
    const sinMargen = empresas.filter((c) => !logPathHeadroom(c.path).ok);
    const datos = {
      total: empresas.length,
      accesibles: empresas.length - inaccesibles.length,
      conCredenciales: empresas.filter((c) => c.hasCredentials).length,
      inaccesibles: inaccesibles.map((c) => c.path),
      sinMargenDeRuta: sinMargen.map((c) => ({ empresa: c.path, ...logPathHeadroom(c.path) })),
    };

    if (empresas.length === 0) {
      return {
        status: 'falla' as CheckStatus,
        detalle: 'No se encontro ninguna empresa SIIWInn.',
        siguientePaso:
          `Compruebe que filepath.txt de la instalacion apunta a una empresa real y que existen las carpetas`
          + ' hermanas SIIWI01, SIIWI02, ... Si estan en una unidad de red, vuelva a conectarla.',
        bloqueante: true,
        datos,
      };
    }
    if (sinMargen.length > 0) {
      return {
        status: 'falla' as CheckStatus,
        detalle: `${sinMargen.length} empresa(s) con una ruta de log que pasa de 50 caracteres: ${datos.sinMargenDeRuta.map((x) => x.ruta).join('; ')}.`,
        siguientePaso:
          'Monte esas empresas en una ruta mas corta (por ejemplo Z:\\SIIWI01\\). El CLI trunca por encima de 50'
          + ' caracteres y entonces no escribe el log ni genera nada.',
        bloqueante: true,
        datos,
      };
    }
    if (inaccesibles.length > 0) {
      return {
        status: 'aviso' as CheckStatus,
        detalle: `${empresas.length} visibles, ${inaccesibles.length} inaccesible(s): ${inaccesibles.map((c) => c.path).join('; ')}.`,
        siguientePaso:
          `Vuelva a conectar la unidad: net use ${(inaccesibles[0]?.path ?? '').slice(0, 2)} \\\\servidor\\recurso`
          + ' (o abrala en el Explorador). Una unidad mapeada pero desconectada es la causa habitual.',
        bloqueante: false,
        datos,
      };
    }
    return {
      status: 'ok' as CheckStatus,
      detalle:
        `${empresas.length} ${empresas.length === 1 ? 'visible' : 'visibles'}, todas accesibles,`
        + ` ${datos.conCredenciales} con credenciales.`,
      bloqueante: false,
      datos,
    };
  });

  // 9. Carpeta de salida.
  await a.add('salida', 'Carpeta de salida', async () => {
    const dir = config.outputDir;
    const margen = outputHeadroom(dir);
    const st = await env.statFile(dir);
    // Si no existe, se comprueba el ancestro mas profundo que si existe: el runner la creara.
    const objetivo = st.existe ? dir : await ancestroExistente(dir, env);
    const puedeEscribir = objetivo ? await env.escribible(objetivo) : false;
    const datos = { carpeta: dir, existe: st.existe, ancestroExistente: objetivo, escribible: puedeEscribir, ...margen };

    if (!margen.ok) {
      return {
        status: 'falla' as CheckStatus,
        detalle:
          `"${dir}" no deja margen: el nombre generado mas largo (${margen.archivoMasLargo}) da`
          + ` ${margen.largoMaximo} caracteres y el limite es ${margen.limite}.`,
        siguientePaso:
          `Cambie "outputDir" en ${configPath()} por una carpeta mas corta, como "C:\\SiigoMCP\\out".`
          + ' El CLI trunca sin avisar y entonces no genera ningun archivo.',
        bloqueante: true,
        datos,
      };
    }
    if (!objetivo || !puedeEscribir) {
      return {
        status: 'falla' as CheckStatus,
        detalle: `No se puede escribir en "${dir}"${objetivo ? ` ni en su ancestro "${objetivo}"` : ''}.`,
        siguientePaso: `Cree la carpeta y de permiso de escritura a su usuario, o apunte "outputDir" de ${configPath()} a otra.`,
        bloqueante: true,
        datos,
      };
    }
    const estado = st.existe ? 'existe' : `se creara en el primer uso, dentro de ${objetivo}`;
    return {
      status: 'ok' as CheckStatus,
      detalle: `${dir}: ${estado}. Margen: ${margen.margen} de ${margen.limite} caracteres.`,
      bloqueante: false,
      datos,
    };
  });

  // 10. Concurrencia.
  await a.add('concurrencia', 'Concurrencia', async () => {
    const vivos = await env.siigoProcesosActivos();
    if (vivos.length === 0) {
      return { status: 'ok' as CheckStatus, detalle: 'Ningun proceso de SIIGO ni de Excel en ejecucion.', bloqueante: false, datos: { procesos: [] } };
    }
    return {
      status: 'aviso' as CheckStatus,
      detalle: `Hay procesos vivos: ${vivos.join(', ')}.`,
      siguientePaso:
        'Cierre las ventanas de SIIGO Pyme y de Excel antes de ejecutar funciones. Una empresa abierta en otra'
        + ' sesion es una causa conocida de que el CLI no escriba el log y no genere nada.',
      bloqueante: false,
      datos: { procesos: vivos },
    };
  });

  return armar(a.checks, env);
}

/** Sube por la ruta hasta encontrar un directorio que exista. */
async function ancestroExistente(dir: string, env: DoctorEnv): Promise<string | null> {
  let actual = path.resolve(dir);
  for (let i = 0; i < 12; i += 1) {
    const padre = path.dirname(actual);
    if (padre === actual) return null;
    const st = await env.statFile(padre);
    if (st.existe && st.esDir) return padre;
    actual = padre;
  }
  return null;
}

type OrigenCredencial = 'entorno' | 'por-empresa' | 'por-defecto' | 'ninguno';

/** Reproduce la precedencia de `resolveCredentials` para poder informar del origen sin lanzar. */
function origenDeCredenciales(config: SiigoConfig, env: DoctorEnv): OrigenCredencial {
  if (env.env['SIIGO_USUARIO'] && env.env['SIIGO_CLAVE']) return 'entorno';
  const porEmpresa = Object.values(config.companies).find((c) => c.user && c.password);
  if (porEmpresa) return 'por-empresa';
  if (config.defaultCredentials?.user && config.defaultCredentials?.password) return 'por-defecto';
  return 'ninguno';
}

function usuarioVisible(config: SiigoConfig, env: DoctorEnv): string | null {
  return (
    env.env['SIIGO_USUARIO']
    ?? Object.values(config.companies).find((c) => c.user && c.password)?.user
    ?? config.defaultCredentials?.user
    ?? null
  );
}

/** `SIIGO_ANO` definido y alguna empresa con un `year` distinto: el del entorno se impone. */
function anioDelEntornoAnulaEmpresa(config: SiigoConfig, env: DoctorEnv): boolean {
  const anoEntorno = env.env['SIIGO_ANO'];
  if (!anoEntorno) return false;
  return Object.values(config.companies).some((c) => c.year && c.year !== anoEntorno);
}

function armar(checks: CheckResult[], env: DoctorEnv): DoctorReport {
  const resumen = {
    ok: checks.filter((c) => c.status === 'ok').length,
    avisos: checks.filter((c) => c.status === 'aviso').length,
    fallas: checks.filter((c) => c.status === 'falla').length,
    desconocidos: checks.filter((c) => c.status === 'desconocido').length,
  };

  const bloqueantes = checks.filter((c) => c.status === 'falla' && c.bloqueante);
  const dudososCriticos = checks.filter((c) => c.status === 'desconocido' && (c.id === 'excel' || c.id === 'sesion'));

  let veredicto: Veredicto;
  if (bloqueantes.length > 0) veredicto = 'no-listo';
  else if (dudososCriticos.length > 0) veredicto = 'indeterminado';
  else if (resumen.avisos > 0 || resumen.desconocidos > 0) veredicto = 'listo-con-avisos';
  else veredicto = 'listo';

  // El primero es el que desbloquea: fallas bloqueantes, luego el resto de fallas, luego el resto.
  const prioridad = (c: CheckResult): number => {
    if (c.status === 'falla') return c.bloqueante ? 0 : 1;
    if (c.status === 'desconocido') return 2;
    return 3;
  };
  const siguientesPasos = [...new Set(
    checks
      .filter((c) => c.status !== 'ok' && c.siguientePaso)
      .sort((x, y) => prioridad(x) - prioridad(y))
      .map((c) => `${c.titulo}: ${c.siguientePaso}`),
  )];

  return {
    veredicto,
    siguientesPasos,
    servidor: {
      nombre: SERVER_NAME,
      version: SERVER_VERSION,
      node: env.nodeVersion,
      plataforma: env.plataforma,
      arch: env.arch,
      os: env.osRelease || os.release(),
    },
    // Sin Date.now aleatorio: la marca es informativa y no afecta a ningun veredicto.
    generadoEn: new Date().toISOString(),
    resumen,
    checks,
  };
}
