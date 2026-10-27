export type Params = Record<string, string | string[] | undefined>;

export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Builds "path?…" from current params plus changes; null/"" removes a key. */
export function hrefWith(path: string, current: Params, changes: Record<string, string | number | null | undefined>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const val = first(v);
    if (val) next.set(k, val);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === undefined || v === "") next.delete(k);
    else next.set(k, String(v));
  }
  const qs = next.toString();
  return qs ? `${path}?${qs}` : path;
}
