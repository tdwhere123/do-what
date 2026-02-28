const warnedLegacyEnvKeys = new Set<string>();

function dowhatKeyFromOpenwork(openworkKey: string): string | null {
  if (!openworkKey.startsWith("OPENWORK_")) return null;
  return `DOWHAT_${openworkKey.slice("OPENWORK_".length)}`;
}

function warnLegacyOnce(openworkKey: string, dowhatKey: string): void {
  if (warnedLegacyEnvKeys.has(openworkKey)) return;
  warnedLegacyEnvKeys.add(openworkKey);
  process.stderr.write(`[openwork] Deprecated env \"${openworkKey}\" detected; please migrate to \"${dowhatKey}\".\n`);
}

export function readCompatEnv(openworkKey: string): string | undefined {
  const dowhatKey = dowhatKeyFromOpenwork(openworkKey);
  if (dowhatKey) {
    const dowhatValue = process.env[dowhatKey];
    if (dowhatValue !== undefined) return dowhatValue;
  }

  const openworkValue = process.env[openworkKey];
  if (openworkValue !== undefined && dowhatKey) {
    warnLegacyOnce(openworkKey, dowhatKey);
  }
  return openworkValue;
}
