import { repairDeep } from "./mojibake";
import { emptyStats, epochToIso, IMAGE_EXT, SUPPORTED_IMAGE_EXT, validCoord, VIDEO_EXT, type ParseResult, type ParsedItem } from "./types";

type Json = Record<string, unknown>;

function asArray(v: unknown): Json[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Json[]) : [];
}

function postText(post: Json): string | null {
  for (const d of asArray(post.data)) if (typeof d.post === "string" && d.post) return d.post;
  return null;
}

function resolveMedia(uri: string, entrySet: Set<string>): string | null {
  const clean = uri.replace(/\\/g, "/").replace(/^\//, "");
  if (entrySet.has(clean)) return clean;
  for (const e of entrySet) if (e.endsWith("/" + clean) || clean.endsWith("/" + e)) return e;
  // Modern exports reference "your_facebook_activity/posts/media/..." relative to the zip root.
  const tail = clean.split("/").slice(-3).join("/");
  for (const e of entrySet) if (e.endsWith(tail)) return e;
  return null;
}

/**
 * Facebook "Download your information" JSON export. Posts carry `timestamp`, text in
 * `data[].post`, and `attachments[].data[]` entries holding either `media` (uri, title,
 * description, creation_timestamp) or `place` (name, coordinate{latitude,longitude}, address).
 * Comments on the post written by other people (rare in exports) are kept as
 * `comment` items flagged authoredByOther: used for food mentions only, never shown (P8).
 */
export function parseFacebook(postFiles: Map<string, Buffer>, allEntries: string[], uploaderName?: string): ParseResult {
  const stats = emptyStats();
  stats.files_found = allEntries.length;
  const entrySet = new Set(allEntries);
  const items: ParsedItem[] = [];
  let idx = 0;

  for (const [fileName, buf] of postFiles) {
    let root: unknown;
    try {
      root = repairDeep(JSON.parse(buf.toString("utf8")));
    } catch {
      continue;
    }
    const posts = Array.isArray(root) ? asArray(root) : asArray((root as Json)?.status_updates ?? (root as Json)?.posts);
    for (const post of posts) {
      stats.posts_found++;
      const postRef = `fb:${fileName}:${idx++}`;
      const ts = epochToIso(post.timestamp);
      const text = postText(post);
      let place: { name: string | null; address: string | null; lat: number | null; lng: number | null } | null = null;
      const medias: Json[] = [];
      for (const att of asArray(post.attachments)) {
        for (const d of asArray(att.data)) {
          if (d.media && typeof d.media === "object") medias.push(d.media as Json);
          if (d.place && typeof d.place === "object") {
            const p = d.place as Json;
            const c = (p.coordinate ?? p.location ?? {}) as Json;
            const coord = validCoord(c.latitude, c.longitude);
            place = {
              name: typeof p.name === "string" ? p.name : null,
              address: typeof p.address === "string" ? p.address : null,
              lat: coord?.lat ?? null,
              lng: coord?.lng ?? null,
            };
          }
        }
      }
      let photoCount = 0;
      for (const m of medias) {
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
        const mediaPath = resolveMedia(uri, entrySet);
        if (!mediaPath) {
          stats.missing_media_skipped++;
          continue;
        }
        const desc = typeof m.description === "string" && m.description ? m.description : null;
        items.push({
          kind: "photo",
          sourcePath: mediaPath,
          mediaPath,
          takenAt: epochToIso(m.creation_timestamp) ?? ts,
          lat: place?.lat ?? null,
          lng: place?.lng ?? null,
          placeName: place?.name ?? null,
          placeAddress: place?.address ?? null,
          caption: desc ?? text,
          postRef,
          authoredByOther: false,
        });
        photoCount++;
        stats.photos_queued++;
      }
      if (photoCount === 0 && (text || place)) {
        items.push({
          kind: place ? "checkin" : "post_text",
          sourcePath: `${postRef}:text`,
          takenAt: ts,
          lat: place?.lat ?? null,
          lng: place?.lng ?? null,
          placeName: place?.name ?? null,
          placeAddress: place?.address ?? null,
          caption: text,
          postRef,
          authoredByOther: false,
        });
        stats.texts_found++;
      }
      let ci = 0;
      for (const c of asArray(post.comments)) {
        const author = typeof c.author === "string" ? c.author : null;
        const body = typeof c.comment === "string" ? c.comment : null;
        if (!body) continue;
        items.push({
          kind: "comment",
          sourcePath: `${postRef}:comment:${ci++}`,
          takenAt: epochToIso(c.timestamp) ?? ts,
          lat: null,
          lng: null,
          placeName: null,
          placeAddress: null,
          caption: body,
          postRef,
          authoredByOther: !uploaderName || author !== uploaderName,
        });
      }
    }
  }
  return { platform: "facebook", items, stats };
}
