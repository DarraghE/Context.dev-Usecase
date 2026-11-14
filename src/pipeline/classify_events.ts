import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { items, moments } from "@/db/schema";
import { haversineKm } from "@/lib/geo";
import type { StageContext } from "./runner";

type EventType = NonNullable<(typeof moments.$inferSelect)["eventType"]>;

const SPECIFIC: EventType[] = ["proposal", "engagement_celebration", "first_date", "anniversary", "birthday", "trip", "holiday_celebration", "family_gathering"];

/** Fixed-date holidays (month-day) recognised without a caption cue. */
const HOLIDAYS = new Set(["12-24", "12-25", "12-26", "12-31", "01-01", "02-14"]);

/** The person's "home": the most common 0.5° grid cell among their located items. */
function homeCell(points: { lat: number; lng: number }[]): { lat: number; lng: number } | null {
  if (!points.length) return null;
  const counts = new Map<string, { n: number; lat: number; lng: number }>();
  for (const p of points) {
    const k = `${Math.round(p.lat * 2) / 2},${Math.round(p.lng * 2) / 2}`;
    const c = counts.get(k) ?? { n: 0, lat: 0, lng: 0 };
    counts.set(k, { n: c.n + 1, lat: c.lat + p.lat, lng: c.lng + p.lng });
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0]!;
  return { lat: best.lat / best.n, lng: best.lng / best.n };
}

/**
 * §7.5/US-4 AC2: each moment gets an event_type from the fixed list, with evidence
 * (caption quote, date, place). Cues come from the uploader's own captions (§7.4); other
 * people's comments are never used as event evidence (P8). Without a cue, a moment far
 * from home is a trip, a fixed holiday date is a holiday, otherwise "everyday".
 */
export async function runClassifyEvents(ctx: StageContext): Promise<void> {
  const db = getDb();
  const ms = await db.select().from(moments).where(eq(moments.personId, ctx.personId));
  if (!ms.length) return;
  const all = await db.select().from(items).where(eq(items.personId, ctx.personId));
  const byId = new Map(all.map((i) => [i.id, i]));
  const home = homeCell(all.filter((i) => i.lat !== null && i.lng !== null).map((i) => ({ lat: i.lat!, lng: i.lng! })));

  for (const m of ms) {
    const its = m.itemIds.map((id) => byId.get(id)).filter((i): i is (typeof all)[number] => !!i);
    const own = its.filter((i) => !i.authoredByOther);
    const cues = own.flatMap((i) => (i.textFoodMentions?.event_cues ?? []).map((c) => ({ ...c, itemId: i.id })));
    const specific = cues.filter((c) => SPECIFIC.includes(c.type as EventType)).sort((a, b) => b.confidence - a.confidence);
    const place = own.find((i) => i.placeNameRaw)?.placeNameRaw ?? null;

    let type: EventType = "everyday";
    let confidence = 0.5;
    let reason = "no life-event cue";
    let evidence = cues.slice(0, 0);
    if (specific.length) {
      type = specific[0]!.type as EventType;
      confidence = specific[0]!.confidence;
      evidence = specific.filter((c) => c.type === type);
      reason = "caption cue";
    } else if (home && m.centroidLat !== null && m.centroidLng !== null && haversineKm(home, { lat: m.centroidLat, lng: m.centroidLng! }) > 100) {
      type = "trip";
      confidence = 0.6;
      reason = "far from home";
    } else if (HOLIDAYS.has(m.localDate.slice(5))) {
      type = "holiday_celebration";
      confidence = 0.6;
      reason = "holiday date";
    } else if (cues.length) {
      const top = [...cues].sort((a, b) => b.confidence - a.confidence)[0]!;
      type = top.type as EventType;
      confidence = top.confidence;
      evidence = [top];
      reason = "caption cue";
    }

    await db
      .update(moments)
      .set({
        eventType: type,
        eventConfidence: confidence,
        eventEvidence: {
          quotes: [...new Set(evidence.map((e) => e.quote).filter(Boolean))].slice(0, 3),
          item_ids: [...new Set(evidence.map((e) => e.itemId))],
          date: m.localDate,
          place,
          reason,
        },
      })
      .where(inArray(moments.id, [m.id]));
  }
}
