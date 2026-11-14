/**
 * Instagram and Facebook JSON exports write each UTF-8 byte of a non-ASCII character as a
 * separate \u00XX escape ("SHE SAID YES ðŸ’" instead of "SHE SAID YES 💍"). We detect strings
 * made only of code points <= 0xFF that contain high bytes, re-read them as UTF-8, and keep the
 * result only if it decodes cleanly. Correct text (e.g. real "é", or genuine emoji) is untouched.
 */
export function repairMojibake(s: string): string {
  if (!/[\u0080-ÿ]/.test(s)) return s;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0xff) return s; // already real Unicode
  const bytes = Buffer.from(s, "latin1");
  const decoded = bytes.toString("utf8");
  if (decoded.includes("�")) return s; // not valid UTF-8 → it was genuine Latin-1 text
  return decoded;
}

/** Recursively repairs every string in a parsed JSON value. */
export function repairDeep<T>(value: T): T {
  if (typeof value === "string") return repairMojibake(value) as T;
  if (Array.isArray(value)) return value.map((v) => repairDeep(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = repairDeep(v);
    return out as T;
  }
  return value;
}
