export function isLoopbackAddress(address: string): boolean {
  return (
    address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1'
  );
}

export function getBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorizationHeader.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}
