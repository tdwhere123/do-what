export function resolvePnpmCommand(platform?: string): string;

export function resolveCoreBaseUrl(
  env?: Record<string, string | undefined>,
): string;

export function probeCoreHealth(
  baseUrl: string,
  fetchImpl?: typeof fetch,
): Promise<boolean>;

export function waitForCoreReady(
  options: Record<string, unknown>,
): Promise<void>;

export function runDevEntry(
  input?: Record<string, unknown>,
): Promise<number>;
