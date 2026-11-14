import type { Platform } from "./types";

/**
 * Detects the platform from the zip's structure, never from its file name (US-2 AC3).
 * Verified layouts (docs/decisions.md, "Export formats"):
 *  - Instagram: your_instagram_activity/content/posts_1.json, your_instagram_activity/posts/posts_1.json,
 *    or legacy content/posts_1.json; media under media/posts/YYYYMM/.
 *  - Facebook: your_facebook_activity/posts/your_posts__check_ins__photos_and_videos_1.json
 *    (older: posts/your_posts_1.json with photos_and_videos/).
 *  - Google Takeout: Takeout/Google Photos/<album>/<image> with <image>.json or
 *    <image>.supplemental-metadata.json sidecars (localised folder names tolerated).
 */
export function detectPlatform(entryNames: string[]): Platform {
  const names = entryNames.map((n) => n.replace(/\\/g, "/"));
  const lower = names.map((n) => n.toLowerCase());

  const takeoutImages = lower.filter((n) => /(^|\/)takeout\/google (photos|fotos|foto)\//.test(n) && /\.(jpe?g|png|webp|heic|gif)$/.test(n));
  const takeoutJson = lower.filter((n) => /(^|\/)takeout\/google (photos|fotos|foto)\//.test(n) && n.endsWith(".json"));
  if (takeoutImages.length > 0 && takeoutJson.length > 0) return "google_photos";

  const fbPosts = lower.some((n) => /(^|\/)your_posts[^/]*\.json$/.test(n));
  const fbLegacy = lower.some((n) => /(^|\/)posts\/[^/]+\.json$/.test(n)) && lower.some((n) => /(^|\/)photos_and_videos\//.test(n));
  if (fbPosts || fbLegacy) return "facebook";

  const igPosts = lower.some((n) => /(^|\/)posts_\d+\.json$/.test(n) && !n.includes("facebook"));
  if (igPosts) return "instagram";

  return "unknown";
}

export function instagramPostFiles(names: string[]): string[] {
  return names.filter((n) => /(^|\/)posts_\d+\.json$/i.test(n));
}

export function facebookPostFiles(names: string[]): string[] {
  const modern = names.filter((n) => /(^|\/)your_posts[^/]*\.json$/i.test(n));
  if (modern.length) return modern;
  return names.filter((n) => /(^|\/)posts\/[^/]+\.json$/i.test(n));
}
