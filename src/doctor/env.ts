/**
 * Implementacion real de las sondas del sistema.
 *
 * Todo lo que toca el sistema operativo pasa por aqui, y solo por aqui, para que los tests
 * puedan sustituirlo por un doble y correr en CI sin Windows, sin SIIGO y sin Excel.
 */
import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import type { DoctorEnv, ExcelInfo, SessionInfo, StatInfo } from './types.js';
import { detectExcel, detectSession, siigoProcesosActivos } from './windows.js';

export function realEnv(): DoctorEnv {
  const env = process.env as Record<string, string | undefined>;
  const esWindows = process.platform === 'win32';

  return {
    plataforma: process.platform,
    nodeVersion: process.versions.node,
    arch: process.arch,
    osRelease: os.release(),
    env,

    async detectExcel(): Promise<ExcelInfo> {
      // Fuera de Windows no hay registro que consultar; la respuesta honesta es "no hay".
      if (!esWindows) return { encontrado: false, exePath: null, metodo: 'ninguno', version: null };
      return detectExcel(env);
    },

    async detectSession(): Promise<SessionInfo> {
      if (!esWindows) {
        return { sessionName: null, sessionId: null, interactiva: null, indicios: ['no es Windows'] };
      }
      return detectSession(env);
    },

    async siigoProcesosActivos(): Promise<string[]> {
      if (!esWindows) return [];
      return siigoProcesosActivos();
    },

    async statFile(p: string): Promise<StatInfo> {
      try {
        const s = await stat(p);
        return { existe: true, esDir: s.isDirectory(), mode: s.mode & 0o777 };
      } catch {
        return { existe: false, esDir: false, mode: null };
      }
    },

    async escribible(p: string): Promise<boolean> {
      try {
        await access(p, constants.W_OK);
        return true;
      } catch {
        return false;
      }
    },
  };
}
