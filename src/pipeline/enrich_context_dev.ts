import { eq, inArray, isNotNull, and } from "drizzle-orm";
import { config } from "@/config";
import { getDb } from "@/db/client";
import { enrichments, moments, places, type ScrapedMenu } from "@/db/schema";
import { ContextDevError, domainOf, mapDomain, normaliseUrl, scrapeLinks, scrapeMenu, scrapeMenus, type MenuScrape } from "@/integrations/contextdev";
import { getReplay, ReplayMissingError } from "@/integrations/replay";
import { newId, nowIso } from "@/lib/ids";
import type { StageContext } from "./runner";

/** URL or anchor text that looks like a menu page (§9.2 step 1, plus a few common languages). */
const MENU_RE = /(menu|menyy|ruokalista|carte|carta|speisekarte|food|dinner|lunch|lounas|dessert|a-la-carte)/i;
/** Seasonal, event and drinks-only pages rank last. */
const PENALTY_RE = /(festive|christmas|xmas|joulu|nye|nyd|hogmanay|boxing|galentine|valentine|easter|offer|set-menu|events?\/|security|tour|drinks|wine|cocktail|news|ajankohtaista|comunicati|blog|press|careers|gift)/i;
const MENU_IMAGE_RE = /(menu|menyy|ruokalista|carta|carte|speisekarte|qr)/i;
/** Decorative images that merely mention "menu" in their file name. */
const DECORATIVE_RE = /(banner|header|hero|background|bg[-_.]|strip|logo|icon|favicon|footer)/i;

export function rankCandidates(urls: { url: string; text?: string | null }[]): string[] {
  const scored = urls
    .map((u) => {
      const hay = `${u.url} ${u.text ?? ""}`;
      let s = 0;
      if (/menu|menyy|ruokalista|carte|carta|speisekarte/i.test(hay)) s += 2;
      if (/a-la-carte|dinner|food|dessert/i.test(hay)) s += 1;
      if (/lunch|lounas/i.test(hay)) s += 0.5;
      if (/\/en(\/|$)/i.test(u.url)) s += 1; // chefs read the English page first
      if (PENALTY_RE.test(hay)) s -= 3;
      return { url: normaliseUrl(u.url), s, match: MENU_RE.test(hay) };
    })
    .filter((x) => x.match && x.s > 0)
    .sort((a, b) => b.s - a.s);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of scored) {
    if (seen.has(x.url)) continue;
    seen.add(x.url);
    out.push(x.url);
  }
  return out;
}

type Discovery = { website: string; candidates: string[]; note: string | null };

/**
 * Finds up to 3 menu pages on the venue's site: Map first; then the home page's links
 * (prebuilt `links` parser); then the venue's own location pages (links naming the city, and
 * same-site pages the place lookup cited); finally the home page itself. A site with no URLs
 * and no links (e.g. a parked domain) is abandoned for the alternative website, if any.
 */
async function discover(place: typeof places.$inferSelect, bookingId: string): Promise<Discovery | null> {
  const sites = [place.websiteUrl, place.hints?.alt_website].filter((s): s is string => !!s);
  let note: string | null = null;
  for (const website of sites) {
    const domain = domainOf(website);
    let mapped: string[] = [];
    try {
      mapped = rankCandidates((await mapDomain(domain, bookingId)).urls);
    } catch (e) {
      if (e instanceof ContextDevError && e.status === 402) throw e;
    }
    if (mapped.length) return { website, candidates: mapped.slice(0, config.contextDev.maxCandidates), note };

    let links: { url: string; text?: string | null }[] = [];
    let title: string | null = null;
    try {
      const r = await scrapeLinks(website, bookingId);
      links = r.links.filter((l) => domainOf(l.url) === domain);
      title = r.title;
    } catch (e) {
      if (e instanceof ContextDevError && e.status === 402) throw e;
    }
    const parked = links.length === 0 && (!title || title.replace(/^www\./, "").toLowerCase() === domain.toLowerCase());
    if (parked) {
      note = `${domain} had no pages or links (looks parked); used ${sites[1] ? domainOf(sites[1]) : "no alternative"}`;
      continue;
    }
    let cands = rankCandidates(links);
    if (!cands.length) {
      const aliases = (place.hints?.city_aliases ?? []).map((a) => a.toLowerCase());
      const local = links.filter((l) => aliases.some((a) => `${l.url} ${l.text ?? ""}`.toLowerCase().includes(a))).map((l) => normaliseUrl(l.url));
      const cited = (place.hints?.source_pages ?? []).filter((s) => domainOf(s) === domain).map(normaliseUrl);
      cands = [...new Set([...local, ...cited])];
    }
    if (!cands.length) cands = [normaliseUrl(website)];
    return { website, candidates: cands.slice(0, config.contextDev.maxCandidates), note };
  }
  return null;
}

function hasMenuImage(s: MenuScrape): boolean {
  if (/\.(jpe?g|png|webp|gif)$/i.test(s.url)) return true;
  return s.images.some((i) => {
    if (i.classification === "logo" || i.classification === "icon" || i.classification === "pattern") return false;
    if (DECORATIVE_RE.test(i.url) || DECORATIVE_RE.test(i.alt ?? "")) return false;
    if (!(MENU_IMAGE_RE.test(i.url) || MENU_IMAGE_RE.test(i.alt ?? ""))) return false;
    // A menu or QR code is roughly page- or square-shaped, not a wide strip.
    return !i.width || !i.height || (i.width / i.height < 2.2 && i.height >= 250);
  });
}

/** Merges the scraped pages into one stored menu, with logo and dish photos for the chef card. */
function mergeScrapes(scrapes: MenuScrape[]): ScrapedMenu {
  const sections: ScrapedMenu["menu_sections"] = [];
  const seen = new Set<string>();
  for (const s of scrapes) {
    for (const sec of s.menu.menu_sections) {
      const its = sec.items.filter((i) => {
        const k = i.name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (its.length) sections.push({ section: sec.section ?? "", items: its.map((i) => ({ name: i.name, description: i.description ?? undefined, price: i.price ?? null, dietary_tags: i.dietary_tags ?? [] })) });
    }
  }
  const imgs = scrapes.flatMap((s) => s.images);
  return {
    restaurant_name: scrapes.find((s) => s.menu.restaurant_name)?.menu.restaurant_name ?? undefined,
    menu_sections: sections,
    logo_url: imgs.find((i) => i.classification === "logo")?.url ?? null,
    dish_photos: imgs.filter((i) => i.classification === "photography" && (i.width ?? 0) >= 400).map((i) => i.url).slice(0, 4),
  };
}

const itemCount = (s: MenuScrape) => s.menu.menu_sections.reduce((n, sec) => n + sec.items.length, 0);

/** §9.2 enrichment: menus for every resolved place with a public website. Never blocks the pipeline. */
export async function runEnrichContextDev(ctx: StageContext): Promise<void> {
  const db = getDb();
  const placeIds = [
    ...new Set(
      (await db.select({ placeId: moments.placeId }).from(moments).where(and(eq(moments.personId, ctx.personId), isNotNull(moments.placeId)))).map((r) => r.placeId!),
    ),
  ];
  if (!placeIds.length) return;
  const ps = await db.select().from(places).where(inArray(places.id, placeIds));
  const existing = new Map((await db.select().from(enrichments).where(inArray(enrichments.placeId, placeIds))).map((e) => [e.placeId, e]));

  const freshMs = config.contextDev.maxAgeMs;
  const todo = ps.filter((p) => {
    const e = existing.get(p.id);
    return !e || e.status === "error" || Date.now() - Date.parse(e.scrapedAt) > freshMs;
  });

  const save = async (p: typeof places.$inferSelect, v: { sourceUrl: string; status: (typeof enrichments.$inferSelect)["status"]; menu: ScrapedMenu | null; requestId: string | null; error: string | null; scrapedAt?: string }) => {
    await db
      .insert(enrichments)
      .values({ id: newId(), placeId: p.id, sourceUrl: v.sourceUrl, scrapedAt: v.scrapedAt ?? nowIso(), provider: "context.dev", requestId: v.requestId, menu: v.menu, status: v.status, error: v.error })
      .onConflictDoUpdate({ target: enrichments.placeId, set: { sourceUrl: v.sourceUrl, scrapedAt: v.scrapedAt ?? nowIso(), requestId: v.requestId, menu: v.menu, status: v.status, error: v.error } });
  };

  // Phase 1: discover candidate pages for every place.
  const plans = new Map<string, Discovery>();
  for (const p of todo) {
    if (!p.websiteUrl) {
      await save(p, { sourceUrl: "", status: "no_website", menu: null, requestId: null, error: "no official website found" });
      continue;
    }
    try {
      const d = await discover(p, ctx.bookingId);
      if (!d) await save(p, { sourceUrl: p.websiteUrl, status: "no_website", menu: null, requestId: null, error: "website unusable" });
      else plans.set(p.id, d);
    } catch (e) {
      await save(p, { sourceUrl: p.websiteUrl, status: "error", menu: null, requestId: null, error: describe(e) });
    }
  }

  // Phase 2: the first candidate of every place, together (one Batch when there are many).
  const firsts = [...plans.values()].map((d) => d.candidates[0]!);
  const firstResults = firsts.length ? await scrapeMenus(firsts, ctx.bookingId) : new Map();

  // Phase 3: per place, further candidates only while we still lack a real menu.
  for (const p of todo) {
    const plan = plans.get(p.id);
    if (!plan) continue;
    const scrapes: MenuScrape[] = [];
    const pages: NonNullable<ScrapedMenu["candidate_pages"]> = [];
    const errors: string[] = [];
    for (const [i, url] of plan.candidates.entries()) {
      let r: MenuScrape | ContextDevError | undefined = i === 0 ? firstResults.get(url) : undefined;
      if (r === undefined) {
        try {
          r = await scrapeMenu(url, ctx.bookingId);
        } catch (e) {
          r = e instanceof ContextDevError ? e : new ContextDevError(0, e instanceof ReplayMissingError ? "REPLAY_MISSING" : "ERROR", describe(e));
        }
      }
      if (r instanceof ContextDevError) {
        errors.push(`${url}: ${r.code}`);
        pages.push({ url, items: 0, status: r.code });
        if (r.status === 402) break;
        continue;
      }
      scrapes.push(r);
      pages.push({ url, items: itemCount(r), status: r.jsonError ? `json_error:${r.jsonError}` : "ok", request_id: r.requestId ?? undefined });
      if (itemCount(r) >= config.contextDev.enoughItems) break;
    }

    // In replay mode, the scrape date shown to the chef is the recording date.
    const recordedAt = config.demoReplay ? recordedDate(plan.candidates) : undefined;
    const merged = mergeScrapes(scrapes);
    merged.candidate_pages = pages;
    if (plan.note) merged.website_note = plan.note;
    const best = [...scrapes].sort((a, b) => itemCount(b) - itemCount(a))[0];
    const total = merged.menu_sections.reduce((n, s) => n + s.items.length, 0);
    if (total > 0) {
      await save(p, { sourceUrl: best!.url, status: "ok", menu: merged, requestId: best!.requestId, error: null, scrapedAt: recordedAt });
    } else if (scrapes.length) {
      const imageOnly = scrapes.some(hasMenuImage);
      await save(p, {
        sourceUrl: scrapes[0]!.url,
        status: imageOnly ? "menu_is_image" : "no_menu",
        menu: merged,
        requestId: scrapes[0]!.requestId,
        error: imageOnly ? "the menu on this site is an image or QR code, not text" : "no menu text found on the candidate pages (it may be rendered by a script widget)",
        scrapedAt: recordedAt,
      });
    } else {
      await save(p, { sourceUrl: plan.candidates[0] ?? plan.website, status: "error", menu: merged, requestId: null, error: errors.join("; ").slice(0, 400) || "scrape failed" });
    }
  }
}

function describe(e: unknown): string {
  if (e instanceof ContextDevError) {
    if (e.status === 402) return "Context.dev credits exhausted (402)";
    if (e.status === 408) return "Context.dev timed out (408)";
    if (e.status === 429) return "Context.dev rate limit (429) after retries";
    return `${e.code}: ${e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}

function recordedDate(urls: string[]): string | undefined {
  for (const u of urls) {
    const entry = getReplay<{ recorded_at?: string }>("contextdev", `scrape|${normaliseUrl(u)}`);
    if (entry?.recorded_at) return entry.recorded_at;
  }
  return undefined;
}
