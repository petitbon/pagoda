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
