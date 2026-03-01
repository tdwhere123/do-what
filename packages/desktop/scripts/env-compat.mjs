export function readCompatEnv(key) {
  const value = process.env[key];
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}
