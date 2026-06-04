/**
 * Minimal semantic-version comparison for the update check. Tolerates a leading
 * "v" (GitHub tags like "v1.2.0") and ignores pre-release/build metadata.
 */

function parse(v: string): [number, number, number] {
  const clean = v.trim().replace(/^v/i, "").split(/[-+]/)[0];
  const [a = 0, b = 0, c = 0] = clean.split(".").map((n) => parseInt(n, 10) || 0);
  return [a, b, c];
}

/** -1 if a<b, 0 if equal, 1 if a>b (by major, minor, patch). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/** True when `latest` is a strictly newer version than `current`. */
export function isNewer(latest: string, current: string): boolean {
  return compareVersions(latest, current) === 1;
}
