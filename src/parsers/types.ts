export type Platform = "instagram" | "facebook" | "google_photos" | "unknown";

/** One photo, text post, comment or check-in found in an export, before detection. */
export type ParsedItem = {
  kind: "photo" | "post_text" | "comment" | "checkin";
  /** Path inside the zip for media; a synthetic stable id (e.g. `post:12`) for text-only items. */
  sourcePath: string;
  /** Zip entry holding the image, for photos. */
  mediaPath?: string;
  takenAt: string | null;
  lat: number | null;
  lng: number | null;
  placeName: string | null;
  placeAddress: string | null;
  caption: string | null;
  postRef: string | null;
  authoredByOther: boolean;
};

export type ParseStats = {
  files_found: number;
  posts_found: number;
  photos_queued: number;
  texts_found: number;
  videos_skipped: number;
  unsupported_skipped: number;
  missing_media_skipped: number;
};

export type ParseResult = { platform: Platform; items: ParsedItem[]; stats: ParseStats };

export const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif)$/i;
export const VIDEO_EXT = /\.(mp4|mov|m4v|avi|3gp|webm|mkv)$/i;
export const SUPPORTED_IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i; // HEIC is counted as unsupported (sharp prebuilds lack HEVC)

export function emptyStats(): ParseStats {
  return { files_found: 0, posts_found: 0, photos_queued: 0, texts_found: 0, videos_skipped: 0, unsupported_skipped: 0, missing_media_skipped: 0 };
}

export function epochToIso(v: unknown): string | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

export function validCoord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = typeof lat === "string" ? Number(lat) : lat;
  const b = typeof lng === "string" ? Number(lng) : lng;
  if (typeof a !== "number" || typeof b !== "number" || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a === 0 && b === 0) return null; // Takeout uses 0,0 for "no location"
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { lat: a, lng: b };
}

/** Depth-first search for the first value under any of the given key names (tolerant parsing). */
export function findKey(obj: unknown, names: string[], depth = 4): unknown {
  if (!obj || typeof obj !== "object" || depth < 0) return undefined;
  for (const n of names) {
    if (n in (obj as Record<string, unknown>)) {
      const v = (obj as Record<string, unknown>)[n];
      if (v !== undefined && v !== null && v !== "") return v;
    }
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (v && typeof v === "object") {
      const r = findKey(v, names, depth - 1);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}
