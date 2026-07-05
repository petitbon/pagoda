import { readFile } from 'node:fs/promises';

export const stableJson = (value: unknown): string => JSON.stringify(value, null, 2);

export async function readJson<T>(path: string): Promise<{ value: T; raw: string }> {
  const raw = await readFile(path, 'utf8');
  return { value: JSON.parse(raw) as T, raw };
}
