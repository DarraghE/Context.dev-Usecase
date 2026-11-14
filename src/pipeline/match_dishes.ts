import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { config } from "@/config";
import { getDb } from "@/db/client";
import { enrichments, items, memories, moments, type MenuItemMatch } from "@/db/schema";
import { structured } from "@/integrations/claude";
import { nullable, num, obj, str } from "@/integrations/schema";
import { newId, nowIso } from "@/lib/ids";
import { loadPrompt } from "@/prompts";
import type { StageContext } from "./runner";

export const normaliseDish = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type Dish = { key: string; family: string; name: string; description: string | null; category: string | null; sourceItemId: string | null; confidence: number };

/** Distinct dishes in a moment: photo detections first, then caption mentions merged into them. */
export function dishesForMoment(its: (typeof items.$inferSelect)[]): Dish[] {
  const dishes = new Map<string, Dish>();
  for (const i of its) {
    if (!i.isFood || !i.food) continue;
    for (const d of i.food.items) {
      if (d.confidence < config.detect.foodConfidence) continue;
      const key = normaliseDish(d.dish_name);
      if (!key) continue;
      const prev = dishes.get(key);
      if (!prev || d.confidence > prev.confidence) {
        dishes.set(key, {
          key,
          family: normaliseDish(d.dish_generic) || key,
          name: d.dish_name,
          description: d.dish_generic || null,
          category: d.category,
          sourceItemId: i.mediaKey ? i.id : (prev?.sourceItemId ?? null),
          confidence: d.confidence,
        });
      }
    }
  }
  for (const i of its) {
    for (const m of i.textFoodMentions?.food_mentions ?? []) {
      const key = normaliseDish(m.normalised || m.text);
      if (!key) continue;
      const hit = [...dishes.values()].find((d) => d.key === key || d.key.includes(key) || key.includes(d.key) || d.family.includes(key));
      if (hit) continue;
      dishes.set(key, { key, family: key, name: m.normalised || m.text, description: null, category: m.category ?? null, sourceItemId: null, confidence: 0.6 });
    }
  }
  return [...dishes.values()];
}

const MATCH_SCHEMA = obj({ item_name: nullable(str()), match_confidence: num("0 to 1"), reason: str() });
const MatchZ = z.object({ item_name: z.string().nullable(), match_confidence: z.number(), reason: z.string() });

export const dishMatchReplayKey = (dishKey: string, sourceUrl: string) => `${dishKey}|${sourceUrl}`;

/** §9.2 dish matching: the photographed dish vs. the scraped menu items, accepted at ≥0.7. */
async function matchDish(dish: Dish, enr: typeof enrichments.$inferSelect, bookingId: string): Promise<MenuItemMatch | null> {
  const menuItems = (enr.menu?.menu_sections ?? []).flatMap((s) => s.items.map((i) => ({ section: s.section, ...i })));
  if (!menuItems.length) return null;
  const r = await structured({
    stage: "dish_match",
    model: config.models.dishMatch,
    effort: config.effort.dishMatch,
    prompt: loadPrompt("dish_match"),
    content: [
      {
        type: "text",
        text: JSON.stringify({
          detected_dish: { name: dish.name, generic: dish.description, category: dish.category },
          menu_items: menuItems.map((i) => ({ section: i.section, name: i.name, description: i.description ?? null })),
        }),
      },
    ],
    schema: MATCH_SCHEMA,
    validate: MatchZ,
    replayKey: dishMatchReplayKey(dish.key, enr.sourceUrl),
    bookingId,
  });
  if (!r.item_name || r.match_confidence < config.matching.minConfidence) return null;
  const item = menuItems.find((i) => i.name === r.item_name) ?? menuItems.find((i) => normaliseDish(i.name) === normaliseDish(r.item_name!));
  if (!item) return null;
  return {
    enrichment_id: enr.id,
    item_name: item.name,
    item_description: item.description ?? null,
    price: item.price ?? null,
    match_confidence: r.match_confidence,
    source_url: enr.sourceUrl,
  };
}

/** Creates/updates one memory per distinct dish per moment and attaches menu matches. */
export async function runMatchDishes(ctx: StageContext): Promise<void> {
  const db = getDb();
  const ms = await db.select().from(moments).where(eq(moments.personId, ctx.personId));
  const all = await db.select().from(items).where(eq(items.personId, ctx.personId));
  const byId = new Map(all.map((i) => [i.id, i]));
  const placeIds = ms.map((m) => m.placeId).filter((p): p is string => !!p);
  const enrs = placeIds.length ? await db.select().from(enrichments).where(inArray(enrichments.placeId, placeIds)) : [];
  const enrByPlace = new Map(enrs.map((e) => [e.placeId, e]));

  for (const m of ms) {
    const its = m.itemIds.map((id) => byId.get(id)).filter((i): i is (typeof all)[number] => !!i);
    const dishes = dishesForMoment(its);
    const enr = m.placeId ? enrByPlace.get(m.placeId) : undefined;
    for (const d of dishes) {
      let match: MenuItemMatch | null = null;
      if (enr && enr.status === "ok") {
        try {
          match = await matchDish(d, enr, ctx.bookingId);
        } catch (e) {
          console.warn("[match] dish match failed:", (e as Error).message);
        }
      }
      await db
        .insert(memories)
        .values({
          id: newId(),
          bookingId: ctx.bookingId,
          personId: ctx.personId,
          momentId: m.id,
          dishKey: d.key,
          dishFamily: d.family,
          dishName: d.name,
          dishDescription: d.description,
          dishCategory: d.category,
          sourceItemId: d.sourceItemId,
          menuItemMatch: match,
          significance: 0,
          significanceParts: null,
          sensitiveFlags: [],
          status: "pending",
          hiddenByDefault: false,
          reviewedAt: null,
          coupleNote: null,
          chefImageKey: null,
          source: "export",
          surprise: false,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        })
        .onConflictDoUpdate({
          target: [memories.momentId, memories.dishKey],
          set: { dishFamily: d.family, dishName: d.name, dishDescription: d.description, dishCategory: d.category, sourceItemId: d.sourceItemId, menuItemMatch: match, updatedAt: nowIso() },
        });
    }
    const keep = dishes.map((d) => d.key);
    await db.delete(memories).where(and(eq(memories.momentId, m.id), keep.length ? notInArray(memories.dishKey, keep) : undefined));
  }
}
