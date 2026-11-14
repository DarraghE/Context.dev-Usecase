import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bookings, enrichments, items, memories, moments, places } from "@/db/schema";
import { FLAG_LABELS } from "@/pipeline/flag_sensitive";
import { blurFaces, type Box } from "@/privacy/blur";
import { signMediaUrl } from "@/privacy/media";
import { keys, storage } from "@/storage";
import { audit } from "./audit";
import { nowIso } from "./ids";

export const EVENT_LABELS: Record<string, string> = {
  proposal: "Proposal",
  engagement_celebration: "Engagement celebration",
  first_date: "First date",
  anniversary: "Anniversary",
  birthday: "Birthday",
  trip: "Trip",
  holiday_celebration: "Holiday",
  family_gathering: "Family gathering",
  everyday: "Everyday",
  other: "Other",
};

type Mem = typeof memories.$inferSelect;

async function context(mems: Mem[]) {
  const db = getDb();
  const momentIds = [...new Set(mems.map((m) => m.momentId))];
  const ms = momentIds.length ? await db.select().from(moments).where(inArray(moments.id, momentIds)) : [];
  const placeIds = [...new Set(ms.map((m) => m.placeId).filter((x): x is string => !!x))];
  const ps = placeIds.length ? await db.select().from(places).where(inArray(places.id, placeIds)) : [];
  const es = placeIds.length ? await db.select().from(enrichments).where(inArray(enrichments.placeId, placeIds)) : [];
  return { moments: new Map(ms.map((m) => [m.id, m])), places: new Map(ps.map((p) => [p.id, p])), enrichments: new Map(es.map((e) => [e.placeId, e])) };
}

function enrichmentView(e: typeof enrichments.$inferSelect | undefined, mem: Mem, full = false) {
  if (!e) return null;
  return {
    provider: e.provider,
    status: e.status,
    source_url: e.sourceUrl || null,
    scraped_at: e.scrapedAt,
    label: "current menu",
    restaurant_name: e.menu?.restaurant_name ?? null,
    logo_url: e.menu?.logo_url ?? null,
    dish_photos: e.menu?.dish_photos ?? [],
    note: e.error ?? e.menu?.website_note ?? null,
    item_count: (e.menu?.menu_sections ?? []).reduce((n, s) => n + s.items.length, 0),
    match: mem.menuItemMatch
      ? { item_name: mem.menuItemMatch.item_name, description: mem.menuItemMatch.item_description, price: mem.menuItemMatch.price, confidence: mem.menuItemMatch.match_confidence, source_url: mem.menuItemMatch.source_url }
      : null,
    menu_sections: full ? (e.menu?.menu_sections ?? []) : undefined,
    pages: full ? (e.menu?.candidate_pages ?? []) : undefined,
  };
}

/* ------------------------------ partner review ------------------------------ */

/** US-6 AC1: the partner's own memories, most significant first. */
export async function reviewList(personId: string, status?: "pending" | "approved" | "hidden") {
  const db = getDb();
  const where = status ? and(eq(memories.personId, personId), eq(memories.status, status)) : eq(memories.personId, personId);
  const mems = await db.select().from(memories).where(where).orderBy(desc(memories.significance), memories.createdAt);
  const ctx = await context(mems);
  const itemIds = [...new Set([...ctx.moments.values()].flatMap((m) => m.itemIds))];
  const its = itemIds.length ? await db.select().from(items).where(inArray(items.id, itemIds)) : [];
  const itemById = new Map(its.map((i) => [i.id, i]));

  return mems.map((m) => {
    const mo = ctx.moments.get(m.momentId);
    const place = mo?.placeId ? ctx.places.get(mo.placeId) : undefined;
    const src = m.sourceItemId ? itemById.get(m.sourceItemId) : undefined;
    // Evidence: quotes from the partner's own captions only (P8: never other people's comments).
    const own = (mo?.itemIds ?? []).map((id) => itemById.get(id)).filter((i) => i && !i.authoredByOther);
    const caption = own.find((i) => i!.caption)?.caption ?? null;
    return {
      id: m.id,
      dish: m.dishName,
      dish_description: m.dishDescription,
      category: m.dishCategory,
      status: m.status,
      hidden_by_default: m.hiddenByDefault,
      flags: m.sensitiveFlags.map((f) => ({ key: f, label: FLAG_LABELS[f] ?? f })),
      couple_note: m.coupleNote,
      significance: m.significance,
      significance_parts: m.significanceParts,
      date: mo?.localDate ?? null,
      event_type: mo?.eventType ?? "other",
      event_label: EVENT_LABELS[mo?.eventType ?? "other"],
      event_confidence: mo?.eventConfidence ?? null,
      evidence: { quotes: mo?.eventEvidence?.quotes ?? [], reason: mo?.eventEvidence?.reason ?? null, caption },
      place: place ? { name: place.name, address: place.address, website: place.websiteUrl, method: place.resolutionMethod } : null,
      place_status: mo?.placeStatus ?? null,
      image_url: src?.mediaKey ? signMediaUrl(src.mediaKey, "partner") : null,
      enrichment: enrichmentView(mo?.placeId ? ctx.enrichments.get(mo.placeId) : undefined, m),
    };
  });
}

/** Builds the chef derivative on approval (US-6 AC5, P6). Fails closed: no faces info → no image. */
async function buildChefImage(m: Mem): Promise<string | null> {
  if (!m.sourceItemId) return null;
  const item = (await getDb().select().from(items).where(eq(items.id, m.sourceItemId)))[0];
  if (!item?.mediaKey) return null;
  const crop = await storage.get(item.mediaKey);
  if (!crop) return null;
  const faces = item.food?.faces_in_crop;
  const out = await blurFaces(crop, faces === undefined ? null : (faces as Box[]));
  if (!out) return null;
  const key = keys.chef(m.id);
  await storage.put(key, out);
  return key;
}

export async function reviewAction(personId: string, memoryId: string, action: { type: "approve" } | { type: "hide" } | { type: "note"; note: string }) {
  const db = getDb();
  const m = (await db.select().from(memories).where(and(eq(memories.id, memoryId), eq(memories.personId, personId))))[0];
  if (!m) return null; // not found, or not this partner's memory
  const now = nowIso();
  if (action.type === "approve") {
    const chefImageKey = await buildChefImage(m);
    await db.update(memories).set({ status: "approved", reviewedAt: now, chefImageKey, updatedAt: now }).where(eq(memories.id, m.id));
    await db.update(bookings).set({ status: "chef_ready", updatedAt: now }).where(eq(bookings.id, m.bookingId));
    await audit({ actor: personId, action: "memory.approved", bookingId: m.bookingId, targetType: "memory", targetId: m.id, detail: { chef_image: !!chefImageKey } });
  } else if (action.type === "hide") {
    await storage.delete(keys.chef(m.id));
    await db.update(memories).set({ status: "hidden", reviewedAt: now, chefImageKey: null, updatedAt: now }).where(eq(memories.id, m.id));
    await audit({ actor: personId, action: "memory.hidden", bookingId: m.bookingId, targetType: "memory", targetId: m.id });
  } else {
    await db.update(memories).set({ coupleNote: action.note.trim().slice(0, 280) || null, updatedAt: now }).where(eq(memories.id, m.id));
    await audit({ actor: personId, action: "memory.note_edited", bookingId: m.bookingId, targetType: "memory", targetId: m.id });
  }
  return (await reviewList(personId)).find((x) => x.id === m.id) ?? null;
}

/* ---------------------------------- chef ---------------------------------- */

/**
 * P5: the chef API returns only `approved` memories, and never selects sensitive flags,
 * partner ids, captions or raw crops. Every memory returned is an audited access (P12).
 */
export async function chefList(bookingId: string, chefId: string, view: "timeline" | "ranked", opts: { audit?: boolean } = { audit: true }) {
  const db = getDb();
  const mems = await db
    .select()
    .from(memories)
    .where(and(eq(memories.bookingId, bookingId), eq(memories.status, "approved")));
  const ctx = await context(mems);
  const out = mems.map((m) => chefView(m, ctx, false));
  if (view === "ranked") out.sort((a, b) => b.significance - a.significance || (a.date ?? "").localeCompare(b.date ?? ""));
  else out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || b.significance - a.significance);
  if (opts.audit !== false && out.length) {
    await audit({ actor: chefId, action: "chef.memory_viewed", bookingId, targetType: "memory", detail: { memory_ids: out.map((m) => m.id), view } });
  }
  return out;
}

export async function chefDetail(bookingId: string, chefId: string, memoryId: string) {
  const db = getDb();
  const m = (await db.select().from(memories).where(and(eq(memories.id, memoryId), eq(memories.bookingId, bookingId), eq(memories.status, "approved"))))[0];
  if (!m) return null;
  const ctx = await context([m]);
  await audit({ actor: chefId, action: "chef.memory_viewed", bookingId, targetType: "memory", targetId: m.id, detail: { view: "detail" } });
  return chefView(m, ctx, true);
}

function chefView(m: Mem, ctx: Awaited<ReturnType<typeof context>>, full: boolean) {
  const mo = ctx.moments.get(m.momentId);
  const place = mo?.placeId ? ctx.places.get(mo.placeId) : undefined;
  return {
    id: m.id,
    dish: m.dishName,
    dish_description: m.dishDescription,
    category: m.dishCategory,
    significance: m.significance,
    date: mo?.localDate ?? null,
    event_type: mo?.eventType ?? "other",
    event_label: EVENT_LABELS[mo?.eventType ?? "other"],
    event_quote: mo?.eventEvidence?.quotes?.[0] ?? null,
    couple_note: m.coupleNote,
    place: place ? { name: place.name, address: place.address, city: place.city, website: place.websiteUrl } : null,
    image_url: m.chefImageKey ? signMediaUrl(m.chefImageKey, "chef") : null,
    enrichment: enrichmentView(mo?.placeId ? ctx.enrichments.get(mo.placeId) : undefined, m, full),
  };
}

export type ReviewMemory = Awaited<ReturnType<typeof reviewList>>[number];
export type ChefMemory = ReturnType<typeof chefView>;
