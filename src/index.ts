#!/usr/bin/env node
/**
 * Punto de entrada. Con argumentos atiende un subcomando (ver src/cli.ts); sin ellos habla
 * MCP por stdio, y entonces stdout esta reservado para el protocolo: cualquier mensaje para
 * el usuario va por stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ejecutar, parseArgs } from './cli.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';

async function main(): Promise<number> {
  const cmd = parseArgs(process.argv.slice(2));
  if (cmd.tipo !== 'servidor') return ejecutar(cmd);

  if (process.platform !== 'win32') {
    process.stderr.write(
      `${SERVER_NAME}: SIIGO Pyme solo existe en Windows. Este servidor arrancara, pero no podra ejecutar EXCELSIIGO.exe.\n`,
    );
  }

  const server = createServer();
  await server.connect(new StdioServerTransport());
  process.stderr.write(`${SERVER_NAME} ${SERVER_VERSION} escuchando por stdio.\n`);
  process.stderr.write(`${SERVER_NAME}: si algo falla, ejecute "npx -y ${SERVER_NAME} --doctor".\n`);
  // El servidor queda vivo sobre el transporte; no hay codigo de salida hasta que se cierre.
  return 0;
}

main()
  .then((code) => {
    // En modo servidor no se sale: el proceso sigue atendiendo stdio.
    if (code !== 0) process.exit(code);
  })
  .catch((err: unknown) => {
    process.stderr.write(`${SERVER_NAME}: error fatal: ${(err as Error).message}\n`);
    process.exit(1);
  });
