import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bookings, items, memories, moments } from "@/db/schema";
import { activeConsent } from "@/privacy/consent";
import { addDays, nowIso } from "@/lib/ids";
import type { StageContext } from "./runner";

const ROMANTIC = new Set(["proposal", "engagement_celebration", "first_date", "anniversary"]);
/** alcohol_heavy is a hint for the couple only; it does not hide the memory (§7.8). */
const HINT_ONLY = new Set(["alcohol_heavy"]);

export const FLAG_LABELS: Record<string, string> = {
  hospital_or_medical: "Looks like a hospital or medical setting",
  funeral_or_grief: "May relate to a funeral or loss",
  possible_ex_partner: "A romantic moment from before your relationship began",
  alcohol_heavy: "Mostly about drinks",
  other_people_private: "Mainly about someone else",
};

/**
 * §7.8: flags sensitive memories and starts them hidden ("hidden by default"). Flags never
 * leave the partner scope (the chef API doesn't select them). A partner's own decision
 * (reviewedAt) is never overridden by a re-run.
 */
export async function runFlagSensitive(ctx: StageContext): Promise<void> {
  const db = getDb();
  const booking = (await db.select().from(bookings).where(eq(bookings.id, ctx.bookingId)))[0]!;
  const consent = await activeConsent(ctx.personId);
  const relationshipStart = consent?.relationshipStartDate ?? null;
  const tenYearsBefore = addDays(booking.weddingDate, -3652);

  const mems = await db.select().from(memories).where(eq(memories.personId, ctx.personId));
  const ms = await db.select().from(moments).where(eq(moments.personId, ctx.personId));
  const its = await db.select().from(items).where(eq(items.personId, ctx.personId));
  const momentById = new Map(ms.map((m) => [m.id, m]));
  const itemById = new Map(its.map((i) => [i.id, i]));

  for (const mem of mems) {
    const m = momentById.get(mem.momentId);
    if (!m) continue;
    const mItems = m.itemIds.map((id) => itemById.get(id)).filter((i): i is (typeof its)[number] => !!i);
    const flags = new Set<string>();
    for (const i of mItems) {
      for (const f of i.food?.setting_flags ?? []) flags.add(f);
      if (!i.authoredByOther) for (const f of i.textFoodMentions?.sensitive_cues ?? []) flags.add(f);
    }
    if (m.eventType && ROMANTIC.has(m.eventType)) {
      const before = relationshipStart ? m.localDate < relationshipStart : m.localDate < tenYearsBefore;
      if (before) flags.add("possible_ex_partner");
    }
    const list = [...flags].sort();
    const hides = list.some((f) => !HINT_ONLY.has(f));
    const patch: Partial<typeof memories.$inferInsert> = { sensitiveFlags: list, updatedAt: nowIso() };
    if (!mem.reviewedAt) {
      if (hides && mem.status !== "hidden") Object.assign(patch, { status: "hidden", hiddenByDefault: true });
      if (!hides && mem.hiddenByDefault) Object.assign(patch, { status: "pending", hiddenByDefault: false });
    }
    await db.update(memories).set(patch).where(eq(memories.id, mem.id));
  }

  if (mems.length) {
    await db
      .update(bookings)
      .set({ status: "reviewing", updatedAt: nowIso() })
      .where(and(eq(bookings.id, ctx.bookingId), inArray(bookings.status, ["invited", "collecting"])));
  }
}
