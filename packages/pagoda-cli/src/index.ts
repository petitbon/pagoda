#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { main } from './cli/main.js';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(({ exitCode }) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { main, consoleIo } from './cli/main.js';
export type { PagodaCliIo, PagodaCommandResult } from './types.js';
