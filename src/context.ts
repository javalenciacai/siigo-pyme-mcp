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

  invalidate(): void {
    this.configCache = null;
    this.discovery = null;
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
