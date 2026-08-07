/**
 * Tipos del diagnostico. Los consumen por igual el subcomando `--doctor`, la herramienta MCP
 * `siigo_doctor` y los tests.
 */
import type { SiigoContext } from '../context.js';

export type CheckStatus = 'ok' | 'aviso' | 'falla' | 'desconocido';

export type CheckId =
  | 'plataforma'
  | 'node'
  | 'instalaciones'
  | 'excel'
  | 'sesion'
  | 'config'
  | 'credenciales'
  | 'empresas'
  | 'salida'
  | 'concurrencia';

export interface CheckResult {
  id: CheckId;
  titulo: string;
  status: CheckStatus;
  /** Que se observo, en una linea. */
  detalle: string;
  /**
   * Que hacer al respecto. Obligatorio cuando `status !== 'ok'`: empieza por un verbo en
   * imperativo y nombra una ruta, una variable de entorno o una herramienta concreta.
   */
  siguientePaso?: string;
  /** Sin esto no se puede ejecutar ninguna funcion de SIIGO. */
  bloqueante: boolean;
  /** Datos crudos y estables, para consumo de maquina. Nunca contiene claves. */
  datos?: Record<string, unknown>;
  ms: number;
}

export type Veredicto = 'listo' | 'listo-con-avisos' | 'no-listo' | 'indeterminado';

export interface DoctorReport {
  // `veredicto` y `siguientesPasos` van primero a proposito: si un cliente trunca el JSON,
  // lo que sobrevive es lo unico que el agente necesita para decidir.
  veredicto: Veredicto;
  siguientesPasos: string[];
  servidor: { nombre: string; version: string; node: string; plataforma: string; arch: string; os: string };
  generadoEn: string;
  resumen: { ok: number; avisos: number; fallas: number; desconocidos: number };
  checks: CheckResult[];
}

export interface ExcelInfo {
  encontrado: boolean;
  exePath: string | null;
  metodo: 'app-paths' | 'progid' | 'ruta-conocida' | 'ninguno';
  version: string | null;
}

export interface SessionInfo {
  sessionName: string | null;
  sessionId: number | null;
  /** `null` cuando no se pudo determinar. */
  interactiva: boolean | null;
  indicios: string[];
}

export interface StatInfo {
  existe: boolean;
  esDir: boolean;
  mode: number | null;
}

/**
 * Sondas del sistema. Se inyectan para que los tests sean puros y CI no necesite Windows,
 * SIIGO ni Excel. Ninguna lanza: degradan a un resultado desconocido.
 */
export interface DoctorEnv {
  plataforma: NodeJS.Platform;
  nodeVersion: string;
  arch: string;
  osRelease: string;
  env: Record<string, string | undefined>;
  detectExcel(): Promise<ExcelInfo>;
  detectSession(): Promise<SessionInfo>;
  /** Procesos de SIIGO o Excel vivos ahora mismo. */
  siigoProcesosActivos(): Promise<string[]>;
  statFile(p: string): Promise<StatInfo>;
  /** `fs.access(W_OK)`. No crea nada. */
  escribible(p: string): Promise<boolean>;
}

export interface DoctorOptions {
  /** Descubrir empresas escanea discos y cuesta segundos. Por defecto `true`. */
  incluirEmpresas?: boolean;
  env?: DoctorEnv;
  /** Contexto ya calentado, para reutilizar la cache de descubrimiento en vez de reescanear. */
  ctx?: SiigoContext;
}
