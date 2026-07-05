export const uniqueStrings = (values: readonly string[]): string[] =>
  [...new Set(values.filter((value) => value.trim().length > 0))].sort();

export const targetPrefix = (targetId: string): string =>
  targetId.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'TARGET';

export const targetSlug = (targetId: string): string =>
  targetId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'target';

export const scenarioIdSlug = (scenarioId: string): string =>
  scenarioId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scenario';

export function titleFromScenarioId(scenarioId: string): string {
  return scenarioId
    .replace(/-\d{3}$/, '')
    .toLowerCase()
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function evidenceBaseFromScenarioId(targetId: string, scenarioId: string): string {
  const prefix = targetPrefix(targetId);
  const body = scenarioId
    .replace(new RegExp(`^${prefix}-`), '')
    .replace(/-\d{3}$/, '');
  return body.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'OUTCOME';
}
