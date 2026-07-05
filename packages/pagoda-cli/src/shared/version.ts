import { readFileSync } from 'node:fs';

export function readCliVersion(metaUrl = import.meta.url): string {
  for (const relativePath of ['../package.json', '../../package.json']) {
    try {
      const cliPackage = JSON.parse(readFileSync(new URL(relativePath, metaUrl), 'utf8')) as {
        version?: string;
      };
      return cliPackage.version ?? '0.0.0';
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return '0.0.0';
}

export const pagodaVersion = readCliVersion();
