import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { items, memories, moments } from "@/db/schema";
import { SCORING } from "@/scoring/config";
import { daysBetween, significance } from "@/scoring/significance";
import type { StageContext } from "./runner";

/**
 * §7.7 scoring. Recurrence and proximity are computed across the whole booking (both partners),
 * because the couple shares the meals that matter; see docs/decisions.md.
 */
export async function runScore(ctx: StageContext): Promise<void> {
  const db = getDb();
  const mems = await db.select().from(memories).where(eq(memories.bookingId, ctx.bookingId));
  const ms = await db.select().from(moments).where(eq(moments.bookingId, ctx.bookingId));
  const its = await db.select().from(items).where(eq(items.bookingId, ctx.bookingId));
  const momentById = new Map(ms.map((m) => [m.id, m]));
  const itemById = new Map(its.map((i) => [i.id, i]));

  const familyMoments = new Map<string, Set<string>>();
  for (const m of mems) familyMoments.set(m.dishFamily, (familyMoments.get(m.dishFamily) ?? new Set()).add(m.momentId));
  const keyDates = ms.filter((m) => m.eventType && (SCORING.proximityEvents as readonly string[]).includes(m.eventType)).map((m) => m.localDate);

  for (const mem of mems) {
    const m = momentById.get(mem.momentId);
    if (!m) continue;
    const sentiments = m.itemIds
      .map((id) => itemById.get(id))
      .filter((i) => i && !i.authoredByOther && i.textFoodMentions)
      .map((i) => i!.textFoodMentions!.sentiment);
    const nearest = keyDates.length ? Math.min(...keyDates.map((d) => daysBetween(d, m.localDate))) : null;
    const { score, parts } = significance({
      eventType: m.eventType,
      eventConfidence: m.eventConfidence,
      sentiment: sentiments.length ? Math.max(...sentiments) : 0,
      recurrenceMoments: familyMoments.get(mem.dishFamily)?.size ?? 1,
      daysToKeyMoment: nearest,
      menuMatchConfidence: mem.menuItemMatch?.match_confidence ?? null,
    });
    await db.update(memories).set({ significance: score, significanceParts: parts }).where(eq(memories.id, mem.id));
  }
}
