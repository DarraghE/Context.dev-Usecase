import { eq } from "drizzle-orm";
import { z } from "zod";
import { config } from "@/config";
import { getDb } from "@/db/client";
import { items, moments, places } from "@/db/schema";
import { structured } from "@/integrations/claude";
import { answersVenueWebsite, domainOf } from "@/integrations/contextdev";
import { ReplayMissingError } from "@/integrations/replay";
import { nullable, num, obj, str } from "@/integrations/schema";
import { nearestCity } from "@/lib/geo";
import { newId, nowIso } from "@/lib/ids";
import { loadPrompt } from "@/prompts";
import type { StageContext } from "./runner";

const RESOLVE_SCHEMA = obj({
  venue_name: nullable(str()),
  address: nullable(str()),
  city: nullable(str()),
  website_url: nullable(str()),
  confidence: num("0 to 1"),
  evidence: str("one line"),
});
const ResolveZ = z.object({
  venue_name: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  website_url: z.string().nullable(),
  confidence: z.number(),
  evidence: z.string(),
});

/** Domains that list venues but are not the venue's own site. */
const NOT_OFFICIAL = /(tripadvisor|yelp|google\.|goo\.gl|facebook|instagram|thefork|opentable|wolt|foodora|ubereats|deliveroo|justeat|booking\.com|tiktok|x\.com|twitter|foursquare|zomato|quandoo|resy|sevenrooms|bing\.com|apple\.com|wikipedia)/i;

export const placeCacheKey = (lat: number | null, lng: number | null, name: string | null) =>
  `${lat === null ? "-" : lat.toFixed(3)},${lng === null ? "-" : lng.toFixed(3)}|${(name ?? "").trim().toLowerCase()}`;

export const coordReplayKey = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

function origin(u: string): string | null {
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.host}/`;
  } catch {
    return null;
  }
}

/**
 * Picks the official website. Context.dev Answers is preferred (§7.6 VERIFY); when it returns
 * no website but its own sources include the venue's site, that origin is used; Claude's
 * web-search website is the fallback.
 */
export function chooseWebsite(answers: { websiteUrl: string | null; confidence: number; sources: string[] } | null, claudeWebsite: string | null) {
  if (answers && answers.confidence >= config.places.minConfidence) {
    if (answers.websiteUrl && !NOT_OFFICIAL.test(answers.websiteUrl)) return { url: answers.websiteUrl, source: "context.dev answers" };
    const src = answers.sources.find((s) => !NOT_OFFICIAL.test(s));
    if (src && origin(src)) return { url: origin(src)!, source: "context.dev answers (sources)" };
  }
  if (claudeWebsite && !NOT_OFFICIAL.test(claudeWebsite)) return { url: claudeWebsite, source: "claude web search" };
  return null;
}

/** §7.6 place resolution, per moment with food. */
export async function runResolvePlaces(ctx: StageContext): Promise<void> {
  const db = getDb();
  const ms = await db.select().from(moments).where(eq(moments.personId, ctx.personId));
  const all = await db.select().from(items).where(eq(items.personId, ctx.personId));
  const byId = new Map(all.map((i) => [i.id, i]));

  for (const m of ms) {
    const its = m.itemIds.map((id) => byId.get(id)).filter((i): i is (typeof all)[number] => !!i);
    const food = its.filter((i) => i.isFood);
    // Step 4: never resolve what looks like a private home.
    if (food.length && food.every((i) => i.food?.scene === "home")) {
      await db.update(moments).set({ placeId: null, placeStatus: "private_home" }).where(eq(moments.id, m.id));
      continue;
    }
    const named = its.find((i) => i.placeNameRaw && !i.authoredByOther);
    const lat = named?.lat ?? m.centroidLat;
    const lng = named?.lng ?? m.centroidLng;
    if (!named && (lat === null || lng === null)) {
      await db.update(moments).set({ placeId: null, placeStatus: "no_location" }).where(eq(moments.id, m.id));
      continue;
    }

    const cacheKey = placeCacheKey(lat, lng, named?.placeNameRaw ?? null);
    const cached = (await db.select().from(places).where(eq(places.cacheKey, cacheKey)))[0];
    if (cached) {
      await db.update(moments).set({ placeId: cached.id, placeStatus: "resolved" }).where(eq(moments.id, m.id));
      continue;
    }

    try {
      let venueName: string | null = null;
      let address: string | null = named?.placeAddressRaw ?? null;
      let city: string | null = null;
      let claudeWebsite: string | null = null;
      let confidence = 0;
      let method: "export_place" | "web_search" = "web_search";

      const near = nearestCity(lat, lng);
      if (named) {
        // Step 1: the export already names the place.
        venueName = named.placeNameRaw!;
        method = "export_place";
        confidence = 0.9;
        city = near?.label ?? (named.placeAddressRaw?.split(",").slice(-2).join(",").trim() || null);
      } else {
        // Step 2: coordinates only → Claude with the web search server tool.
        const dishes = [...new Set(food.flatMap((i) => (i.food?.items ?? []).filter((x) => x.confidence >= 0.6).map((x) => x.dish_name)))];
        const r = await structured({
          stage: "place_resolve",
          model: config.models.placeResolve,
          effort: config.effort.placeResolve,
          prompt: loadPrompt("place_resolve"),
          content: [
            {
              type: "text",
              text: JSON.stringify({ latitude: Number(lat!.toFixed(5)), longitude: Number(lng!.toFixed(5)), date: m.localDate, dishes, nearest_city: near?.label ?? null }),
            },
          ],
          schema: RESOLVE_SCHEMA,
          validate: ResolveZ,
          replayKey: coordReplayKey(lat!, lng!),
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
          bookingId: ctx.bookingId,
        });
        if (!r.venue_name || r.confidence < config.places.minConfidence) {
          await db.update(moments).set({ placeId: null, placeStatus: "not_found" }).where(eq(moments.id, m.id));
          continue;
        }
        venueName = r.venue_name;
        address = r.address;
        city = near?.label ?? r.city;
        claudeWebsite = r.website_url;
        confidence = r.confidence;
      }

      // Official website: Context.dev Answers with venue name + city only (P10).
      let answers: Awaited<ReturnType<typeof answersVenueWebsite>> | null = null;
      if (city) {
        try {
          answers = await answersVenueWebsite(venueName, city, ctx.bookingId);
          address = address ?? answers.address;
        } catch (e) {
          if (!(e instanceof ReplayMissingError)) console.warn("[places] context.dev answers failed:", (e as Error).message);
        }
      }
      const site = chooseWebsite(answers, claudeWebsite);
      const sourcePages = (answers?.sources ?? []).filter((s) => site && domainOf(s) === domainOf(site.url) && new URL(s).pathname.length > 1);
      const alt = claudeWebsite && site && domainOf(claudeWebsite) !== domainOf(site.url) ? claudeWebsite : null;

      const placeId = newId();
      await db
        .insert(places)
        .values({
          id: placeId,
          cacheKey,
          name: venueName,
          address,
          city,
          lat,
          lng,
          websiteUrl: site?.url ?? null,
          resolutionMethod: method,
          resolutionConfidence: confidence,
          websiteSource: site?.source ?? null,
          hints: { alt_website: alt, source_pages: sourcePages, city_aliases: near?.aliases ?? [] },
          createdAt: nowIso(),
        })
        .onConflictDoNothing();
      const row = (await db.select().from(places).where(eq(places.cacheKey, cacheKey)))[0]!;
      await db.update(moments).set({ placeId: row.id, placeStatus: "resolved" }).where(eq(moments.id, m.id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[places] resolution failed:", msg);
      await db.update(moments).set({ placeId: null, placeStatus: "error" }).where(eq(moments.id, m.id));
    }
  }
}
