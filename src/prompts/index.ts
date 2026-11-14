import fs from "node:fs";
import path from "node:path";

export type Prompt = { id: string; version: number; key: string; text: string };

const cache = new Map<string, Prompt>();

/**
 * Loads a versioned prompt file from src/prompts (rule 4: no inline prompt strings).
 * Files are named `<id>.v<version>.md` and start with a front-matter header.
 */
export function loadPrompt(id: string, version = 1): Prompt {
  const key = `${id}.v${version}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const file = path.resolve(process.cwd(), "src", "prompts", `${key}.md`);
  const raw = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`prompt ${key} has no version header`);
  const header = Object.fromEntries(
    m[1]!
      .split("\n")
      .map((l) => l.split(":").map((s) => s.trim()))
      .filter((p) => p.length >= 2)
      .map(([k, ...v]) => [k, v.join(":")]),
  );
  if (header.id !== id || Number(header.version) !== version) throw new Error(`prompt ${key} header mismatch`);
  const p: Prompt = { id, version, key, text: m[2]!.trim() };
  cache.set(key, p);
  return p;
}
