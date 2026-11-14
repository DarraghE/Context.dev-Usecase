import { repairDeep } from "./mojibake";
import { emptyStats, epochToIso, findKey, IMAGE_EXT, SUPPORTED_IMAGE_EXT, validCoord, VIDEO_EXT, type ParseResult, type ParsedItem } from "./types";

type Json = Record<string, unknown>;

/** Collects post objects from any JSON shape: a bare array, or an object holding arrays of posts. */
function collectPosts(root: unknown): Json[] {
  if (Array.isArray(root)) return root.filter((x): x is Json => !!x && typeof x === "object" && "media" in (x as Json));
  if (root && typeof root === "object") {
    const out: Json[] = [];
    for (const v of Object.values(root as Json)) out.push(...collectPosts(v));
    return out;
  }
  return [];
}

function resolveMedia(uri: string, entrySet: Set<string>, rootPrefix: string): string | null {
  const clean = uri.replace(/\\/g, "/").replace(/^\//, "");
  if (entrySet.has(clean)) return clean;
  if (entrySet.has(rootPrefix + clean)) return rootPrefix + clean;
  // Tolerate exports re-zipped inside a top-level folder.
  for (const e of entrySet) if (e.endsWith("/" + clean)) return e;
  return null;
}

/**
 * Instagram "Download your information" JSON export. Each post has `media[]` with `uri`,
 * `creation_timestamp`, `title` (caption on single-media posts) and optional
 * `media_metadata.photo_metadata.exif_data[].latitude/longitude`. The post-level `title`
 * is the caption for carousels. Location names, when present, are read tolerantly.
 */
export function parseInstagram(postFiles: Map<string, Buffer>, allEntries: string[]): ParseResult {
  const stats = emptyStats();
  stats.files_found = allEntries.length;
  const entrySet = new Set(allEntries);
  const items: ParsedItem[] = [];
  let postIndex = 0;

  for (const [fileName, buf] of postFiles) {
    let root: unknown;
    try {
      root = repairDeep(JSON.parse(buf.toString("utf8")));
    } catch {
      continue;
    }
    const rootIdx = fileName.search(/(your_instagram_activity|content)\//);
    const rootPrefix = rootIdx > 0 ? fileName.slice(0, rootIdx) : "";
    for (const post of collectPosts(root)) {
      stats.posts_found++;
      const postRef = `ig:${fileName}:${postIndex++}`;
      const media = Array.isArray(post.media) ? (post.media as Json[]) : [];
      const postCaption = typeof post.title === "string" && post.title ? post.title : null;
      const postTs = epochToIso(post.creation_timestamp);
      let captioned = false;
      const locName = findKey(post, ["location_name", "place_name"]) ?? (findKey(post, ["location", "place"]) as Json | undefined)?.name;

      for (const m of media) {
        const uri = typeof m.uri === "string" ? m.uri : null;
        if (!uri) continue;
        if (VIDEO_EXT.test(uri)) {
          stats.videos_skipped++;
          continue;
        }
        if (!IMAGE_EXT.test(uri) || !SUPPORTED_IMAGE_EXT.test(uri)) {
          stats.unsupported_skipped++;
          continue;
        }
        const mediaPath = resolveMedia(uri, entrySet, rootPrefix);
        if (!mediaPath) {
          stats.missing_media_skipped++;
          continue;
        }
        const exif = findKey(m, ["exif_data"]);
        const exifArr = Array.isArray(exif) ? (exif as Json[]) : [];
        let coord: { lat: number; lng: number } | null = null;
        for (const e of exifArr) coord = coord ?? validCoord(e.latitude, e.longitude);
        const loc = (findKey(m, ["location"]) as Json | undefined) ?? undefined;
        coord = coord ?? (loc ? validCoord(loc.latitude, loc.longitude) : null);
        const caption = (typeof m.title === "string" && m.title ? m.title : null) ?? postCaption;
        items.push({
          kind: "photo",
          sourcePath: mediaPath,
          mediaPath,
          takenAt: epochToIso(m.creation_timestamp) ?? postTs,
          lat: coord?.lat ?? null,
          lng: coord?.lng ?? null,
          placeName: typeof locName === "string" ? locName : typeof loc?.name === "string" ? (loc.name as string) : null,
          placeAddress: null,
          caption,
          postRef,
          authoredByOther: false,
        });
        stats.photos_queued++;
        if (caption) captioned = true;
      }
      if (captioned) stats.texts_found++;
    }
  }
  return { platform: "instagram", items, stats };
}
