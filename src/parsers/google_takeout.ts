import { emptyStats, epochToIso, IMAGE_EXT, SUPPORTED_IMAGE_EXT, validCoord, VIDEO_EXT, type ParseResult, type ParsedItem } from "./types";

type Json = Record<string, unknown>;

const PHOTOS_DIR = /(^|\/)takeout\/google (photos|fotos|foto)\//i;

/**
 * Finds the sidecar for an image. Takeout names it `<image>.json` (older exports) or
 * `<image>.supplemental-metadata.json` (since late 2024), and truncates long names
 * (e.g. `<image>.supplemental-metad.json`). Duplicates are named `IMG(1).jpg` ↔ `IMG.jpg(1).json`.
 */
export function findSidecar(image: string, jsonNames: Set<string>): string | null {
  const direct = [`${image}.json`, `${image}.supplemental-metadata.json`];
  for (const d of direct) if (jsonNames.has(d)) return d;
  const dup = image.match(/^(.*)\((\d+)\)(\.[^.]+)$/);
  if (dup) {
    const alt = `${dup[1]}${dup[3]}(${dup[2]}).json`;
    if (jsonNames.has(alt)) return alt;
    const alt2 = `${dup[1]}${dup[3]}.supplemental-metadata(${dup[2]}).json`;
    if (jsonNames.has(alt2)) return alt2;
  }
  for (const j of jsonNames) if (j.startsWith(`${image}.`) && j.endsWith(".json")) return j;
  const noExt = image.replace(/\.[^./]+$/, "");
  if (jsonNames.has(`${noExt}.json`)) return `${noExt}.json`;
  return null;
}

/**
 * Google Photos via Google Takeout: images plus JSON sidecars with `photoTakenTime.timestamp`,
 * `geoData` / `geoDataExif` (0,0 = no location) and `description`. EXIF (via exifr) is the
 * fallback for missing dates and GPS, applied later when the image bytes are read.
 */
export function parseGoogleTakeout(sidecars: Map<string, Buffer>, allEntries: string[]): ParseResult {
  const stats = emptyStats();
  stats.files_found = allEntries.length;
  const jsonNames = new Set(allEntries.filter((n) => PHOTOS_DIR.test(n) && n.toLowerCase().endsWith(".json")));
  const items: ParsedItem[] = [];

  for (const name of allEntries) {
    if (!PHOTOS_DIR.test(name)) continue;
    if (VIDEO_EXT.test(name)) {
      stats.videos_skipped++;
      continue;
    }
    if (!IMAGE_EXT.test(name)) continue;
    if (!SUPPORTED_IMAGE_EXT.test(name)) {
      stats.unsupported_skipped++;
      continue;
    }
    const sidecarName = findSidecar(name, jsonNames);
    let meta: Json = {};
    if (sidecarName && sidecars.has(sidecarName)) {
      try {
        meta = JSON.parse(sidecars.get(sidecarName)!.toString("utf8"));
      } catch {
        meta = {};
      }
    }
    const taken = (meta.photoTakenTime as Json | undefined)?.timestamp ?? (meta.creationTime as Json | undefined)?.timestamp;
    const geo = (meta.geoData as Json | undefined) ?? {};
    const geoExif = (meta.geoDataExif as Json | undefined) ?? {};
    const coord = validCoord(geo.latitude, geo.longitude) ?? validCoord(geoExif.latitude, geoExif.longitude);
    const description = typeof meta.description === "string" && meta.description.trim() ? meta.description.trim() : null;
    items.push({
      kind: "photo",
      sourcePath: name,
      mediaPath: name,
      takenAt: epochToIso(taken),
      lat: coord?.lat ?? null,
      lng: coord?.lng ?? null,
      placeName: null,
      placeAddress: null,
      caption: description,
      postRef: null,
      authoredByOther: false,
    });
    stats.photos_queued++;
    stats.posts_found++;
    if (description) stats.texts_found++;
  }
  return { platform: "google_photos", items, stats };
}

export function takeoutSidecarNames(allEntries: string[]): string[] {
  return allEntries.filter((n) => PHOTOS_DIR.test(n) && n.toLowerCase().endsWith(".json"));
}
