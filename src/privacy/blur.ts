import sharp from "sharp";

export type Box = [number, number, number, number]; // x0,y0,x1,y1 as fractions

export const BLUR_SIGMA = 24; // P6 requires sigma >= 20
const FACE_PADDING = 0.25; // grow each detected face box by 25% on every side

/**
 * Builds the chef-facing derivative of a food crop (P6):
 * - every detected face region is Gaussian-blurred (sigma >= 20) after padding the box;
 * - output is re-encoded JPEG with no metadata (P4).
 * Returns null when face detection is unusable (fail closed: the chef gets no image).
 */
export async function blurFaces(crop: Buffer, faceBoxes: Box[] | null | undefined): Promise<Buffer | null> {
  if (faceBoxes === null || faceBoxes === undefined) return null;
  const img = sharp(crop, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) return null;

  const base = await img.jpeg({ quality: 85 }).toBuffer();
  if (faceBoxes.length === 0) {
    return sharp(base).jpeg({ quality: 85 }).toBuffer(); // re-encode; sharp drops metadata by default
  }

  const composites: Parameters<ReturnType<typeof sharp>["composite"]>[0] = [];
  for (const [x0, y0, x1, y1] of faceBoxes) {
    const bw = x1 - x0;
    const bh = y1 - y0;
    const left = Math.max(0, Math.floor((x0 - bw * FACE_PADDING) * W));
    const top = Math.max(0, Math.floor((y0 - bh * FACE_PADDING) * H));
    const right = Math.min(W, Math.ceil((x1 + bw * FACE_PADDING) * W));
    const bottom = Math.min(H, Math.ceil((y1 + bh * FACE_PADDING) * H));
    const width = right - left;
    const height = bottom - top;
    if (width < 2 || height < 2) continue;
    const region = await sharp(base).extract({ left, top, width, height }).blur(BLUR_SIGMA).toBuffer();
    composites.push({ input: region, left, top });
  }
  return sharp(base).composite(composites).jpeg({ quality: 85 }).toBuffer();
}

/** Maps full-image face boxes into a crop's coordinate space; drops faces outside the crop. */
export function facesInCrop(faces: Box[], crop: Box): Box[] {
  const [cx0, cy0, cx1, cy1] = crop;
  const cw = cx1 - cx0;
  const ch = cy1 - cy0;
  const out: Box[] = [];
  for (const [x0, y0, x1, y1] of faces) {
    const ix0 = Math.max(x0, cx0);
    const iy0 = Math.max(y0, cy0);
    const ix1 = Math.min(x1, cx1);
    const iy1 = Math.min(y1, cy1);
    if (ix1 <= ix0 || iy1 <= iy0) continue;
    out.push([(ix0 - cx0) / cw, (iy0 - cy0) / ch, (ix1 - cx0) / cw, (iy1 - cy0) / ch]);
  }
  return out;
}

/** Pixel variance of a region, used by the P6 test to prove a region was blurred. */
export async function regionVariance(image: Buffer, box: Box): Promise<number> {
  const meta = await sharp(image).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const left = Math.floor(box[0] * W);
  const top = Math.floor(box[1] * H);
  const width = Math.max(1, Math.floor((box[2] - box[0]) * W));
  const height = Math.max(1, Math.floor((box[3] - box[1]) * H));
  const { data } = await sharp(image).extract({ left, top, width, height }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (const v of data) sum += v;
  const mean = sum / data.length;
  let sq = 0;
  for (const v of data) sq += (v - mean) ** 2;
  return sq / data.length;
}
