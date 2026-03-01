export function readCompatEnv(key: string): string | undefined {
  const value = process.env[key];
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}
