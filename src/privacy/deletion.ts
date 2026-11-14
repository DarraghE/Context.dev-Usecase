import { and, eq, inArray, isNotNull, lt, ne, notInArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  bookings,
  consents,
  enrichments,
  invites,
  items,
  jobs,
  memories,
  menus,
  moments,
  people,
  places,
  uploads,
} from "@/db/schema";
import { keys, storage } from "@/storage";
import { audit } from "@/lib/audit";
import { nowIso } from "@/lib/ids";
import { config } from "@/config";
import { cancelJobsFor } from "@/pipeline/runner";

export type DeletionCounts = Record<string, number>;

/**
 * Deletes one person's uploads, derived items, moments, memories, enrichment links and
 * storage objects (US-1 AC4). Used by consent withdrawal and by booking deletion.
 */
export async function deletePersonData(personId: string): Promise<DeletionCounts> {
  const db = getDb();
  const counts: DeletionCounts = {};
  cancelJobsFor(personId);

  const ups = await db.select().from(uploads).where(eq(uploads.personId, personId));
  for (const u of ups) if (u.storageKey) await storage.delete(u.storageKey);
  counts.raw_files = await storage.deletePrefix(`raw/${personId}`);
  counts.crop_files = await storage.deletePrefix(`crops/${personId}`);

  const mems = await db.select({ id: memories.id, chef: memories.chefImageKey, bookingId: memories.bookingId }).from(memories).where(eq(memories.personId, personId));
  let chefFiles = 0;
  for (const m of mems) {
    if (await storage.delete(keys.chef(m.id))) chefFiles += m.chef ? 1 : 0;
  }
  counts.chef_files = chefFiles;

  // Menu drafts derived from these memories go too.
  const memIds = new Set(mems.map((m) => m.id));
  const bookingIds = [...new Set(mems.map((m) => m.bookingId))];
  let menusDeleted = 0;
  if (memIds.size && bookingIds.length) {
    const ms = await db.select().from(menus).where(inArray(menus.bookingId, bookingIds));
    const toDelete = ms.filter((m) => m.courses.courses.some((c) => c.memory_ids.some((id) => memIds.has(id))) || m.courses.unused_memories_worth_considering.some((id) => memIds.has(id)));
    if (toDelete.length) {
      await db.delete(menus).where(inArray(menus.id, toDelete.map((m) => m.id)));
      menusDeleted = toDelete.length;
    }
  }
  counts.menu_versions = menusDeleted;

  counts.memories = (await db.delete(memories).where(eq(memories.personId, personId)).returning({ id: memories.id })).length;
  counts.moments = (await db.delete(moments).where(eq(moments.personId, personId)).returning({ id: moments.id })).length;
  counts.items = (await db.delete(items).where(eq(items.personId, personId)).returning({ id: items.id })).length;
  counts.uploads = (await db.delete(uploads).where(eq(uploads.personId, personId)).returning({ id: uploads.id })).length;
  counts.jobs = (await db.delete(jobs).where(eq(jobs.inputRef, personId)).returning({ id: jobs.id })).length;
  if (ups.length) {
    counts.jobs += (await db.delete(jobs).where(inArray(jobs.inputRef, ups.map((u) => u.id))).returning({ id: jobs.id })).length;
  }
  counts.orphan_places = await deleteOrphanPlaces();
  return counts;
}

/** Places and their enrichments are kept only while a moment still links to them. */
async function deleteOrphanPlaces(): Promise<number> {
  const db = getDb();
  const linked = (await db.select({ placeId: moments.placeId }).from(moments).where(isNotNull(moments.placeId))).map((r) => r.placeId!);
  const orphanFilter = linked.length ? notInArray(places.id, linked) : undefined;
  const orphans = await db.select({ id: places.id }).from(places).where(orphanFilter);
  if (!orphans.length) return 0;
  const ids = orphans.map((o) => o.id);
  await db.delete(enrichments).where(inArray(enrichments.placeId, ids));
  await db.delete(places).where(inArray(places.id, ids));
  return ids.length;
}

/** US-1 AC4: withdrawal deletes the partner's data within 5 minutes (we do it synchronously). */
export async function withdrawConsent(personId: string): Promise<DeletionCounts> {
  const db = getDb();
  const person = (await db.select().from(people).where(eq(people.id, personId)))[0];
  const started = Date.now();
  await db.update(consents).set({ withdrawnAt: nowIso() }).where(and(eq(consents.personId, personId)));
  const counts = await deletePersonData(personId);
  await audit({
    actor: personId,
    action: "deletion.withdrawal",
    bookingId: person?.bookingId ?? null,
    targetType: "person",
    targetId: personId,
    detail: { counts, duration_ms: Date.now() - started },
  });
  return counts;
}

/** Deletes everything for a booking (caterer "delete now", or the daily retention job). */
export async function deleteBooking(bookingId: string, actor: string): Promise<DeletionCounts> {
  const db = getDb();
  const started = Date.now();
  const ppl = await db.select().from(people).where(eq(people.bookingId, bookingId));
  const totals: DeletionCounts = {};
  for (const p of ppl) {
    const c = await deletePersonData(p.id);
    for (const [k, v] of Object.entries(c)) totals[k] = (totals[k] ?? 0) + v;
  }
  for (const m of await db.select({ id: memories.id }).from(memories).where(eq(memories.bookingId, bookingId))) await storage.delete(keys.chef(m.id));
  totals.memories = (totals.memories ?? 0) + (await db.delete(memories).where(eq(memories.bookingId, bookingId)).returning({ id: memories.id })).length;
  totals.menu_versions = (totals.menu_versions ?? 0) + (await db.delete(menus).where(eq(menus.bookingId, bookingId)).returning({ id: menus.id })).length;
  totals.jobs = (totals.jobs ?? 0) + (await db.delete(jobs).where(eq(jobs.bookingId, bookingId)).returning({ id: jobs.id })).length;
  const personIds = ppl.map((p) => p.id);
  if (personIds.length) {
    totals.consents = (await db.delete(consents).where(inArray(consents.personId, personIds)).returning({ id: consents.id })).length;
    totals.invites = (await db.delete(invites).where(inArray(invites.personId, personIds)).returning({ id: invites.id })).length;
    totals.people = (await db.delete(people).where(inArray(people.id, personIds)).returning({ id: people.id })).length;
  }
  await db
    .update(bookings)
    .set({
      status: "deleted",
      coupleDisplayName: "[deleted]",
      dietaryConstraints: { allergies: [], diets: {}, notes: "" },
      updatedAt: nowIso(),
    })
    .where(eq(bookings.id, bookingId));
  totals.orphan_places = (totals.orphan_places ?? 0) + (await deleteOrphanPlaces());
  await audit({
    actor,
    action: "deletion.booking",
    bookingId,
    targetType: "booking",
    targetId: bookingId,
    detail: { counts: totals, duration_ms: Date.now() - started },
  });
  return totals;
}

/** P2: raw zips never outlive 24 h, even if processing stalled. */
export async function sweepRawZips(now = Date.now()): Promise<number> {
  const db = getDb();
  const cutoff = new Date(now - config.retention.rawZipMaxHours * 3600_000).toISOString();
  const stale = await db
    .select()
    .from(uploads)
    .where(and(isNotNull(uploads.storageKey), lt(uploads.createdAt, cutoff)));
  for (const u of stale) {
    await storage.delete(u.storageKey!);
    await db.update(uploads).set({ storageKey: null, status: "raw_deleted", updatedAt: nowIso() }).where(eq(uploads.id, u.id));
  }
  // Abandoned resumable uploads.
  let tusRemoved = 0;
  for (const f of await storage.list(keys.tusDir())) {
    if (f.mtimeMs < now - config.retention.rawZipMaxHours * 3600_000) {
      await storage.delete(f.key);
      tusRemoved++;
    }
  }
  if (stale.length || tusRemoved) {
    await audit({ actor: "system", action: "deletion.raw_sweep", detail: { raw_zips: stale.length, tus_partials: tusRemoved } });
  }
  return stale.length;
}

/** P9: daily job deleting every booking past `delete_after`, plus the raw-zip sweep. */
export async function runDailyDeletion(today = new Date().toISOString().slice(0, 10)): Promise<{ bookings: number; raw: number }> {
  const db = getDb();
  const due = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(ne(bookings.status, "deleted"), lt(bookings.deleteAfter, today)));
  for (const b of due) await deleteBooking(b.id, "system");
  const raw = await sweepRawZips();
  await audit({ actor: "system", action: "deletion.daily_sweep", detail: { bookings_deleted: due.length, raw_zips_deleted: raw, run_for: today } });
  return { bookings: due.length, raw };
}
