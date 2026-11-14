import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "@/config";

/**
 * Local storage for the demo (./storage). The same key layout maps 1:1 to an S3 bucket
 * in production (EU region). Key prefixes:
 *   raw/<personId>/<uploadId>.zip   raw exports, deleted after detection (P2)
 *   crops/<personId>/<itemId>.jpg   food crops, EXIF-free (P3, P4)
 *   chef/<memoryId>.jpg             face-blurred chef derivatives (P6)
 *   tus/                            in-flight resumable uploads
 */
function resolveKey(key: string): string {
  const root = config.storageDir;
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep) && full !== root) throw new Error("storage key escapes root");
  return full;
}

export const storage = {
  pathFor(key: string): string {
    return resolveKey(key);
  },
  async put(key: string, data: Buffer): Promise<void> {
    const p = resolveKey(key);
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.writeFile(p, data);
  },
  async get(key: string): Promise<Buffer | null> {
    try {
      return await fsp.readFile(resolveKey(key));
    } catch {
      return null;
    }
  },
  exists(key: string): boolean {
    return fs.existsSync(resolveKey(key));
  },
  async delete(key: string): Promise<boolean> {
    try {
      await fsp.rm(resolveKey(key), { force: true });
      return true;
    } catch {
      return false;
    }
  },
  /** Deletes everything under a prefix; returns the number of files removed. */
  async deletePrefix(prefix: string): Promise<number> {
    const dir = resolveKey(prefix);
    if (!fs.existsSync(dir)) return 0;
    let count = 0;
    const walk = async (d: string) => {
      for (const e of await fsp.readdir(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await walk(p);
        else count++;
      }
    };
    await walk(dir);
    await fsp.rm(dir, { recursive: true, force: true });
    return count;
  },
  async move(fromAbsPath: string, key: string): Promise<void> {
    const dest = resolveKey(key);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    try {
      await fsp.rename(fromAbsPath, dest);
    } catch {
      await fsp.copyFile(fromAbsPath, dest);
      await fsp.rm(fromAbsPath, { force: true });
    }
  },
  async list(prefix: string): Promise<{ key: string; mtimeMs: number; size: number }[]> {
    const dir = resolveKey(prefix);
    if (!fs.existsSync(dir)) return [];
    const out: { key: string; mtimeMs: number; size: number }[] = [];
    const walk = async (d: string) => {
      for (const e of await fsp.readdir(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await walk(p);
        else {
          const st = await fsp.stat(p);
          out.push({ key: path.relative(config.storageDir, p).split(path.sep).join("/"), mtimeMs: st.mtimeMs, size: st.size });
        }
      }
    };
    await walk(dir);
    return out;
  },
};

export const keys = {
  raw: (personId: string, uploadId: string) => `raw/${personId}/${uploadId}.zip`,
  crop: (personId: string, itemId: string) => `crops/${personId}/${itemId}.jpg`,
  chef: (memoryId: string) => `chef/${memoryId}.jpg`,
  tusDir: () => "tus",
};
