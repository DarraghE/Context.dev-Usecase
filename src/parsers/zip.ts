import yauzl from "yauzl";

export type ZipEntryInfo = { name: string; size: number };

const normalise = (n: string) => n.replace(/\\/g, "/").replace(/^\.\//, "");

function open(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(path, { lazyEntries: true, autoClose: true, decodeStrings: true }, (err, zf) => (err || !zf ? reject(err ?? new Error("cannot open zip")) : resolve(zf))),
  );
}

function readStream(zf: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zf.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error("cannot read entry"));
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  });
}

/** Lists entries from the central directory without reading file contents. */
export async function listEntries(path: string): Promise<ZipEntryInfo[]> {
  const zf = await open(path);
  return new Promise((resolve, reject) => {
    const out: ZipEntryInfo[] = [];
    zf.on("entry", (e: yauzl.Entry) => {
      if (!e.fileName.endsWith("/")) out.push({ name: normalise(e.fileName), size: e.uncompressedSize });
      zf.readEntry();
    });
    zf.on("end", () => resolve(out));
    zf.on("error", reject);
    zf.readEntry();
  });
}

/**
 * Streams the zip once and calls `fn` for each entry whose name passes `filter`, one at a
 * time, so memory stays bounded even for multi-GB exports.
 */
export async function forEachEntry(path: string, filter: (name: string) => boolean, fn: (name: string, data: Buffer) => Promise<void>): Promise<void> {
  const zf = await open(path);
  await new Promise<void>((resolve, reject) => {
    zf.on("entry", async (e: yauzl.Entry) => {
      const name = normalise(e.fileName);
      try {
        if (!name.endsWith("/") && filter(name)) {
          const data = await readStream(zf, e);
          await fn(name, data);
        }
        zf.readEntry();
      } catch (err) {
        zf.close();
        reject(err);
      }
    });
    zf.on("end", () => resolve());
    zf.on("error", reject);
    zf.readEntry();
  });
}

/** Reads a set of entries fully into memory (small files such as JSON metadata). */
export async function readEntries(path: string, names: Set<string>): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  await forEachEntry(path, (n) => names.has(n), async (n, d) => {
    out.set(n, d);
  });
  return out;
}
