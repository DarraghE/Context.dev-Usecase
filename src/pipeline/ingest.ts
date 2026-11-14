import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bookings, items, people, uploads } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { localDateIn, tzFor } from "@/lib/geo";
import { parseExport, UnsupportedExportError } from "@/parsers";
import { storage } from "@/storage";
import type { StageContext } from "./runner";

/**
 * §7.1 Ingest: stream the zip's central directory, detect the platform from structure,
 * read only the metadata JSON, and insert one `items` row per photo / text post / check-in.
 * Idempotent: rows are keyed by (upload, source_path, kind) and re-runs insert nothing new.
 */
export async function runIngest(ctx: StageContext): Promise<void> {
  const db = getDb();
  const upload = (await db.select().from(uploads).where(eq(uploads.id, ctx.inputRef)))[0];
  if (!upload) throw new Error("upload not found");
  if (upload.status === "raw_deleted" || upload.status === "failed") return; // already past this stage
  if (!upload.storageKey) throw new Error("raw file missing");

  const booking = (await db.select().from(bookings).where(eq(bookings.id, upload.bookingId)))[0]!;
  const person = (await db.select().from(people).where(eq(people.id, upload.personId)))[0]!;
  await db.update(uploads).set({ status: "parsing", updatedAt: nowIso() }).where(eq(uploads.id, upload.id));

  let result;
  try {
    result = await parseExport(storage.pathFor(upload.storageKey), { uploaderName: person.displayName });
  } catch (e) {
    if (e instanceof UnsupportedExportError) {
      await storage.delete(upload.storageKey);
      await db
        .update(uploads)
        .set({ status: "failed", platform: "unknown", error: e.message, storageKey: null, updatedAt: nowIso() })
        .where(eq(uploads.id, upload.id));
      return;
    }
    throw e;
  }

  const rows = result.items.map((it) => {
    const tz = tzFor(it.lat, it.lng, booking.defaultTz);
    return {
      id: newId(),
      uploadId: upload.id,
      personId: upload.personId,
      bookingId: upload.bookingId,
      kind: it.kind,
      takenAt: it.takenAt,
      tz,
      localDate: it.takenAt ? localDateIn(it.takenAt, tz) : null,
      lat: it.lat,
      lng: it.lng,
      placeNameRaw: it.placeName,
      placeAddressRaw: it.placeAddress,
      caption: it.caption,
      postRef: it.postRef,
      authoredByOther: it.authoredByOther,
      sourcePath: it.sourcePath,
      mediaKey: null,
      contentHash: null,
      isFood: null,
      food: null,
      textFoodMentions: null,
      detectStatus: it.kind === "photo" ? ("pending" as const) : ("skipped" as const),
      textStatus: it.caption ? ("pending" as const) : ("none" as const),
      skipReason: null,
      createdAt: nowIso(),
    };
  });
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(items).values(rows.slice(i, i + 200)).onConflictDoNothing();
  }

  await db
    .update(uploads)
    .set({
      platform: result.platform,
      status: "parsed",
      stats: { ...upload.stats, ...result.stats },
      error: null,
      updatedAt: nowIso(),
    })
    .where(eq(uploads.id, upload.id));
}
