export function resolveCoreSessionToken(
  preferredToken: string | null | undefined,
): string | null {
  return preferredToken && preferredToken.trim().length > 0 ? preferredToken.trim() : null;
}

export function createCoreAuthHeaders(
  sessionToken: string | null | undefined,
): HeadersInit | undefined {
  const token = resolveCoreSessionToken(sessionToken);
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}
