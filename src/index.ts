#!/usr/bin/env node
/**
 * Punto de entrada del servidor MCP. Habla MCP por stdio, asi que stdout esta reservado
 * para el protocolo: cualquier mensaje para el usuario va por stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';

async function main(): Promise<void> {
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    process.stdout.write(`${SERVER_NAME} ${SERVER_VERSION}\n`);
    return;
  }

  if (process.platform !== 'win32') {
    process.stderr.write(
      `${SERVER_NAME}: SIIGO Pyme solo existe en Windows. Este servidor arrancara, pero no podra ejecutar EXCELSIIGO.exe.\n`,
    );
  }

  const server = createServer();
  await server.connect(new StdioServerTransport());
  process.stderr.write(`${SERVER_NAME} ${SERVER_VERSION} escuchando por stdio.\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${SERVER_NAME}: error fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
