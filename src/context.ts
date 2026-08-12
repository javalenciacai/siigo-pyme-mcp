/**
 * Estado compartido por las herramientas: configuracion, instalaciones y empresas.
 *
 * El descubrimiento recorre discos y lee el registro, asi que se cachea. Cualquier
 * herramienta que modifique la configuracion debe llamar a `invalidate()`.
 */
import { loadConfig, resolveCredentials, type SiigoConfig } from './config/store.js';
import { listCompanies, listInstallations, type Company, type Installation } from './siigo/discovery.js';

export class SiigoContext {
  private configCache: SiigoConfig | null = null;
  private discovery: Promise<{ installations: Installation[]; companies: Company[] }> | null = null;
  // Por proceso, no persistido: en stdio un proceso es una conversacion. Sirve para anteponer
  // el protocolo de uso una sola vez (ver tools/preamble.ts) sin depender de `instructions` del
  // InitializeResult, que varios clientes MCP descartan. `invalidate()` NO lo toca: guardar
  // credenciales no debe hacer que el protocolo se repita.
  private protocoloEntregado = false;

  invalidate(): void {
    this.configCache = null;
    this.discovery = null;
  }

  /** true la primera vez que se llama en el proceso; despues siempre false. */
  marcarProtocoloEntregado(): boolean {
    if (this.protocoloEntregado) return false;
    this.protocoloEntregado = true;
    return true;
  }

  async config(): Promise<SiigoConfig> {
    if (!this.configCache) this.configCache = await loadConfig();
    return this.configCache;
  }

  private async discover(): Promise<{ installations: Installation[]; companies: Company[] }> {
    const config = await this.config();
    const installations = await listInstallations(config);
    const companies = await listCompanies(installations, config, (companyPath) => {
      try {
        resolveCredentials(config, companyPath);
        return true;
      } catch {
        return false;
      }
    });
    return { installations, companies };
  }

  async installations(): Promise<Installation[]> {
    this.discovery ??= this.discover();
    return (await this.discovery).installations;
  }

  async companies(): Promise<Company[]> {
    this.discovery ??= this.discover();
    return (await this.discovery).companies;
  }
}
