import fs from "node:fs";
import path from "node:path";

/**
 * Recorded-response store for DEMO_REPLAY=1 (§12): the demo and the tests run offline and free.
 * Files live in fixtures/replay/<name>.json as { _provenance, entries: { key: value } }.
 */
type ReplayFile = { _provenance?: string; entries: Record<string, unknown> };

const cache = new Map<string, ReplayFile>();

function fileFor(name: string): string {
  return path.resolve(process.cwd(), "fixtures", "replay", `${name}.json`);
}

export function loadReplay(name: string): ReplayFile {
  const hit = cache.get(name);
  if (hit) return hit;
  const f = fileFor(name);
  const data: ReplayFile = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : { entries: {} };
  data.entries ??= {};
  cache.set(name, data);
  return data;
}

export function getReplay<T = unknown>(name: string, key: string): T | undefined {
  return loadReplay(name).entries[key] as T | undefined;
}

export function recordReplay(name: string, key: string, value: unknown, provenance?: string): void {
  const data = loadReplay(name);
  data.entries[key] = value;
  if (provenance && !data._provenance) data._provenance = provenance;
  const f = fileFor(name);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data, null, 2) + "\n");
}

export function clearReplayCache(): void {
  cache.clear();
}

export class ReplayMissingError extends Error {
  constructor(name: string, key: string) {
    super(`no recorded response in fixtures/replay/${name}.json for key "${key}"`);
  }
}
