import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bookings, consents, enrichments, items, jobs, memories, moments, people, uploads } from "@/db/schema";

export type StageProgress = { key: string; label: string; done: number; total: number };

/**
 * Progress counts only (§8 /api/bookings/:id/status). Never returns captions, dishes,
 * photos or any memory content, so it is safe for the caterer.
 */
export async function bookingStatus(bookingId: string, opts: { personId?: string } = {}) {
  const db = getDb();
  const booking = (await db.select().from(bookings).where(eq(bookings.id, bookingId)))[0];
  if (!booking) return null;
  const ppl = await db.select().from(people).where(eq(people.bookingId, bookingId));
  const partnerIds = ppl.filter((p) => p.role === "partner_a" || p.role === "partner_b").map((p) => p.id);
  const scope = opts.personId ? [opts.personId] : partnerIds;

  const live = partnerIds.length
    ? await db.select().from(consents).where(and(inArray(consents.personId, partnerIds), isNull(consents.withdrawnAt)))
    : [];
  const ups = scope.length ? await db.select().from(uploads).where(inArray(uploads.personId, scope)) : [];
  const its = scope.length ? await db.select({ kind: items.kind, detect: items.detectStatus, text: items.textStatus, isFood: items.isFood, skip: items.skipReason }).from(items).where(inArray(items.personId, scope)) : [];
  const ms = scope.length ? await db.select({ placeId: moments.placeId, placeStatus: moments.placeStatus, eventType: moments.eventType }).from(moments).where(inArray(moments.personId, scope)) : [];
  const mems = scope.length ? await db.select({ status: memories.status, significance: memories.significance }).from(memories).where(inArray(memories.personId, scope)) : [];
  const placeIds = [...new Set(ms.map((m) => m.placeId).filter((x): x is string => !!x))];
  const enrs = placeIds.length ? await db.select({ status: enrichments.status }).from(enrichments).where(inArray(enrichments.placeId, placeIds)) : [];
  const js = await db.select({ status: jobs.status, stage: jobs.stage, inputRef: jobs.inputRef }).from(jobs).where(eq(jobs.bookingId, bookingId));
  const scopedJobs = opts.personId ? js.filter((j) => j.inputRef === opts.personId || ups.some((u) => u.id === j.inputRef)) : js;

  const photos = its.filter((i) => i.kind === "photo");
  const detected = photos.filter((i) => i.detect !== "pending").length;
  const texts = its.filter((i) => i.text !== "none");
  const textsDone = texts.filter((i) => i.text !== "pending").length;
  const placesNeeded = ms.filter((m) => m.placeStatus !== "private_home" && m.placeStatus !== "no_location");
  const placesDone = placesNeeded.filter((m) => m.placeStatus !== null).length;
  const enrichable = placesNeeded.filter((m) => m.placeId).length;
  const running = scopedJobs.some((j) => j.status === "queued" || j.status === "running");
  const lastStage = (s: string) => scopedJobs.some((j) => j.stage === s && j.status === "done");

  const stages: StageProgress[] = [
    { key: "parsed", label: "Exports read", done: ups.filter((u) => u.status !== "uploaded" && u.status !== "parsing").length, total: ups.length },
    { key: "food", label: "Photos checked for food", done: detected, total: photos.length },
    { key: "text", label: "Captions read", done: textsDone, total: texts.length },
    { key: "moments", label: "Moments found", done: lastStage("classify_events") ? ms.length : 0, total: ms.length },
    { key: "places", label: "Places identified", done: placesDone, total: placesNeeded.length },
    { key: "menus", label: "Venue websites read with Context.dev", done: enrs.length, total: Math.max(enrs.length, placeIds.length, enrichable ? 1 : 0) },
    { key: "scored", label: "Memories scored", done: lastStage("flag_sensitive") ? mems.length : 0, total: mems.length },
  ];

  const count = <T extends string>(arr: { status: T }[], s: T) => arr.filter((x) => x.status === s).length;
  const skipped: Record<string, number> = {};
  for (const i of photos) if (i.detect === "skipped" && i.skip) skipped[i.skip] = (skipped[i.skip] ?? 0) + 1;
  for (const u of ups) {
    if (u.stats.videos_skipped) skipped["video"] = (skipped["video"] ?? 0) + u.stats.videos_skipped;
    if (u.stats.unsupported_skipped) skipped["unsupported format"] = (skipped["unsupported format"] ?? 0) + u.stats.unsupported_skipped;
  }

  return {
    booking: { id: booking.id, status: booking.status, wedding_date: booking.weddingDate, delete_after: booking.deleteAfter, couple_display_name: booking.coupleDisplayName },
    partners: ppl
      .filter((p) => p.role === "partner_a" || p.role === "partner_b")
      .map((p) => ({ role: p.role, display_name: p.displayName, consented: live.some((c) => c.personId === p.id) })),
    uploads: { total: ups.length, failed: ups.filter((u) => u.status === "failed").length, raw_deleted: ups.filter((u) => u.status === "raw_deleted").length },
    stages,
    counts: {
      photos: photos.length,
      food_photos: photos.filter((i) => i.isFood).length,
      moments: ms.length,
      enrichments: {
        ok: count(enrs, "ok"),
        no_menu: count(enrs, "no_menu"),
        menu_is_image: count(enrs, "menu_is_image"),
        no_website: count(enrs, "no_website"),
        error: count(enrs, "error"),
      },
      memories: { pending: count(mems, "pending"), approved: count(mems, "approved"), hidden: count(mems, "hidden") },
    },
    skipped,
    jobs: { queued: count(scopedJobs, "queued"), running: count(scopedJobs, "running"), failed: count(scopedJobs, "failed") },
    processing: running,
  };
}

export type BookingStatus = NonNullable<Awaited<ReturnType<typeof bookingStatus>>>;
