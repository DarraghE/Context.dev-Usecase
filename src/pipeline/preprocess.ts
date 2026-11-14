import sharp from "sharp";
import { config } from "@/config";

/**
 * §7.2: resize to a long edge of at most 1568 px, JPEG quality 85, EXIF stripped (P4).
 * sharp drops all metadata unless withMetadata() is called; we never call it.
 */
export async function preprocess(input: Buffer): Promise<{ jpeg: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate() // apply EXIF orientation before the metadata is dropped
    .resize({ width: config.detect.maxLongEdgePx, height: config.detect.maxLongEdgePx, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: config.detect.jpegQuality, mozjpeg: false })
    .toBuffer({ resolveWithObject: true });
  return { jpeg: data, width: info.width, height: info.height };
}

export async function dimensions(input: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const m = await sharp(input, { failOn: "none" }).metadata();
    if (!m.width || !m.height) return null;
    const rotated = (m.orientation ?? 1) >= 5;
    return rotated ? { width: m.height, height: m.width } : { width: m.width, height: m.height };
  } catch {
    return null;
  }
}

/**
 * Perceptual difference hash (dHash) at 16×16 = 256 bits (64 hex chars). The common 64-bit
 * variant collides on similar compositions (a plate on a wooden table); 256 bits keeps true
 * re-encodes and album copies within a few bits while separating different dishes.
 */
export const DHASH_DUPLICATE_BITS = 12;

export async function dHash(input: Buffer): Promise<string> {
  const N = 16;
  const { data } = await sharp(input, { failOn: "none" }).rotate().greyscale().resize(N + 1, N, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) bits += data[y * (N + 1) + x]! > data[y * (N + 1) + x + 1]! ? "1" : "0";
  }
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = Number.parseInt(a[i]!, 16) ^ Number.parseInt(b[i]!, 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

export type Box = [number, number, number, number];

/** Union of item boxes plus a margin (§7.3), clamped to the image. */
export function cropBox(boxes: Box[], margin = config.detect.cropMargin): Box {
  let [x0, y0, x1, y1] = [1, 1, 0, 0];
  for (const b of boxes) {
    x0 = Math.min(x0, b[0]);
    y0 = Math.min(y0, b[1]);
    x1 = Math.max(x1, b[2]);
    y1 = Math.max(y1, b[3]);
  }
  if (x1 <= x0 || y1 <= y0) return [0, 0, 1, 1];
  const w = x1 - x0;
  const h = y1 - y0;
  return [Math.max(0, x0 - w * margin), Math.max(0, y0 - h * margin), Math.min(1, x1 + w * margin), Math.min(1, y1 + h * margin)];
}

export async function cropJpeg(jpeg: Buffer, box: Box, width: number, height: number): Promise<Buffer> {
  const left = Math.floor(box[0] * width);
  const top = Math.floor(box[1] * height);
  const w = Math.max(1, Math.min(width - left, Math.ceil((box[2] - box[0]) * width)));
  const h = Math.max(1, Math.min(height - top, Math.ceil((box[3] - box[1]) * height)));
  return sharp(jpeg).extract({ left, top, width: w, height: h }).jpeg({ quality: 85 }).toBuffer();
}
