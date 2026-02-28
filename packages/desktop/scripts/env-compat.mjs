const warnedLegacyEnvKeys = new Set();

function dowhatKeyFromOpenwork(openworkKey) {
  if (!openworkKey.startsWith("OPENWORK_")) return null;
  return `DOWHAT_${openworkKey.slice("OPENWORK_".length)}`;
}

function warnLegacyOnce(openworkKey, dowhatKey) {
  if (warnedLegacyEnvKeys.has(openworkKey)) return;
  warnedLegacyEnvKeys.add(openworkKey);
  process.stderr.write(`[openwork] Deprecated env \"${openworkKey}\" detected; please migrate to \"${dowhatKey}\".\n`);
}

export function readCompatEnv(openworkKey) {
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
