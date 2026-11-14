import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { config } from "@/config";
import { getDb } from "@/db/client";
import { items, memories, moments } from "@/db/schema";
import { haversineKm } from "@/lib/geo";
import { newId, nowIso } from "@/lib/ids";
import type { StageContext } from "./runner";

type Item = typeof items.$inferSelect;

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const p = this.parent.get(x)!;
    if (p === x) return x;
    const r = this.find(p);
    this.parent.set(x, r);
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

const hasCoords = (i: Item) => i.lat !== null && i.lng !== null;
export const hasFoodSignal = (i: Item) => i.isFood === true || (i.textFoodMentions?.food_mentions.length ?? 0) > 0;

/**
 * Groups one day's items into clusters (§7.5): same post → same moment; items within 3 km are
 * linked (single linkage); items without coordinates join the nearest-in-time located item.
 */
export function clusterDay(dayItems: Item[], clusterKm = config.moments.clusterKm): Item[][] {
  const uf = new UnionFind();
  for (const i of dayItems) uf.find(i.id);
  const byPost = new Map<string, string>();
  for (const i of dayItems) {
    if (!i.postRef) continue;
    const first = byPost.get(i.postRef);
    if (first) uf.union(first, i.id);
    else byPost.set(i.postRef, i.id);
  }
  const located = dayItems.filter(hasCoords);
  for (let a = 0; a < located.length; a++) {
    for (let b = a + 1; b < located.length; b++) {
      if (haversineKm({ lat: located[a]!.lat!, lng: located[a]!.lng! }, { lat: located[b]!.lat!, lng: located[b]!.lng! }) <= clusterKm) {
        uf.union(located[a]!.id, located[b]!.id);
      }
    }
  }
  const t = (i: Item) => (i.takenAt ? Date.parse(i.takenAt) : 0);
  for (const i of dayItems.filter((x) => !hasCoords(x))) {
    if (i.postRef && byPost.get(i.postRef) !== i.id) continue; // already tied to its post
    if (located.length) {
      const nearest = located.reduce((best, cur) => (Math.abs(t(cur) - t(i)) < Math.abs(t(best) - t(i)) ? cur : best));
      uf.union(nearest.id, i.id);
    } else if (dayItems[0]) {
      uf.union(dayItems[0].id, i.id);
    }
  }
  const groups = new Map<string, Item[]>();
  for (const i of dayItems) {
    const r = uf.find(i.id);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  }
  return [...groups.values()];
}

export async function runBuildMoments(ctx: StageContext): Promise<void> {
  const db = getDb();
  const all = await db
    .select()
    .from(items)
    .where(and(eq(items.personId, ctx.personId), isNotNull(items.localDate)));
  const usable = all.filter((i) => i.kind !== "photo" || i.detectStatus === "done");

  const byDay = new Map<string, Item[]>();
  for (const i of usable) byDay.set(i.localDate!, [...(byDay.get(i.localDate!) ?? []), i]);

  const keep: string[] = [];
  for (const [day, dayItems] of byDay) {
    for (const cluster of clusterDay(dayItems)) {
      // Moments with no food item and no food mention are dropped (§7.5).
      if (!cluster.some(hasFoodSignal)) continue;
      const sorted = [...cluster].sort((a, b) => (a.takenAt ?? "").localeCompare(b.takenAt ?? "") || a.sourcePath.localeCompare(b.sourcePath));
      const anchor = sorted[0]!;
      const momentKey = `${ctx.personId}|${day}|${anchor.uploadId}:${anchor.sourcePath}`;
      const food = cluster.filter((i) => i.isFood && hasCoords(i));
      const pts = (food.length ? food : cluster.filter(hasCoords)).map((i) => ({ lat: i.lat!, lng: i.lng! }));
      const centroid = pts.length ? { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length } : null;
      await db
        .insert(moments)
        .values({
          id: newId(),
          bookingId: ctx.bookingId,
          personId: ctx.personId,
          momentKey,
          localDate: day,
          centroidLat: centroid?.lat ?? null,
          centroidLng: centroid?.lng ?? null,
          placeId: null,
          eventType: null,
          eventConfidence: null,
          eventEvidence: null,
          itemIds: sorted.map((i) => i.id),
          placeStatus: null,
          createdAt: nowIso(),
        })
        .onConflictDoUpdate({
          target: moments.momentKey,
          set: { itemIds: sorted.map((i) => i.id), centroidLat: centroid?.lat ?? null, centroidLng: centroid?.lng ?? null, localDate: day },
        });
      keep.push(momentKey);
    }
  }

  // Remove moments that no longer exist for this person (and their memories).
  const stale = await db
    .select({ id: moments.id })
    .from(moments)
    .where(and(eq(moments.personId, ctx.personId), keep.length ? notInArray(moments.momentKey, keep) : undefined));
  for (const s of stale) {
    await db.delete(memories).where(eq(memories.momentId, s.id));
    await db.delete(moments).where(eq(moments.id, s.id));
  }
}
