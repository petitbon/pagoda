import type { PagodaCliReporter } from '../types.js';

export function argValue(args: readonly string[], name: string, fallback?: string): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1];
}

export function hasArg(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

export function runReporter(args: readonly string[]): PagodaCliReporter {
  const value = argValue(args, '--reporter', hasArg(args, '--json') ? 'json' : 'default');
  if (value === 'default' || value === 'json') return value;
  throw new Error(`Unsupported reporter ${value}. Expected default or json.`);
}

export function positiveIntegerArg(args: readonly string[], name: string, fallback: number): number {
  const value = argValue(args, name);
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed > 0 && String(parsed) === value.trim()) return parsed;
  throw new Error(`${name} must be a positive integer.`);
}

export function optionalPositiveIntegerArg(args: readonly string[], name: string): number | undefined {
  const value = argValue(args, name);
  if (value === undefined) return undefined;
  return positiveIntegerArg(args, name, 1);
}
