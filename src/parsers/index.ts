import { detectPlatform, facebookPostFiles, instagramPostFiles } from "./detect";
import { parseFacebook } from "./facebook";
import { parseGoogleTakeout, takeoutSidecarNames } from "./google_takeout";
import { parseInstagram } from "./instagram";
import type { ParseResult } from "./types";
import { listEntries, readEntries } from "./zip";

export class UnsupportedExportError extends Error {}

/** Parses an export zip: detect by structure, read only metadata JSON, list photo items. */
export async function parseExport(zipPath: string, opts: { uploaderName?: string } = {}): Promise<ParseResult> {
  const entries = await listEntries(zipPath);
  const names = entries.map((e) => e.name);
  const platform = detectPlatform(names);
  switch (platform) {
    case "instagram": {
      const files = await readEntries(zipPath, new Set(instagramPostFiles(names)));
      return parseInstagram(files, names);
    }
    case "facebook": {
      const files = await readEntries(zipPath, new Set(facebookPostFiles(names)));
      return parseFacebook(files, names, opts.uploaderName);
    }
    case "google_photos": {
      const files = await readEntries(zipPath, new Set(takeoutSidecarNames(names)));
      return parseGoogleTakeout(files, names);
    }
    default:
      throw new UnsupportedExportError(
        "We couldn't recognise this file. Supported exports: Instagram (Download your information, JSON format), Facebook (Download your information, JSON format) and Google Photos (Google Takeout). Upload the .zip exactly as the platform delivered it.",
      );
  }
}

export { detectPlatform };
