import { createHash } from 'node:crypto';

export const sha256 = (value: string): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;
