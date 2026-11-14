import ContextDev from "context.dev";
import { z } from "zod";
import { config } from "@/config";
import { audit } from "@/lib/audit";
import { getReplay, recordReplay, ReplayMissingError } from "./replay";

/**
 * Context.dev wrapper (§9.2). Used only on public web pages (P10): what we send is a venue
 * name + city (Answers), a domain (Map) or a public URL (Scrape, Batches). Never photos,
 * coordinates, dates, dishes or anyone's name.
 *
 * Endpoints (VERIFY results in docs/decisions.md):
 *   POST /v1/web/answers   client.web.answers      venue name + city → official website
 *   GET  /v1/web/urls      client.web.mapUrls      list a domain's URLs → menu pages
 *   POST /v1/web/scrape    client.web.scrape       links parser; JSON menu extraction; images
 *   POST /v1/batches       client.batch.submit     many menu pages at once (async)
 */

export const MENU_SCHEMA = {
  type: "object",
  properties: {
    restaurant_name: { type: "string" },
    menu_sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                price: { type: "string" },
                dietary_tags: { type: "array", items: { type: "string" } },
              },
              required: ["name"],
            },
          },
        },
        required: ["section", "items"],
      },
    },
  },
  required: ["menu_sections"],
} as const;

export const MENU_INSTRUCTIONS =
  "Extract every dish and drink on this restaurant menu exactly as written. Keep the original language for names; put diet or allergen markers (V, VG, GF, L, G, etc.) into dietary_tags. Leave price empty if not shown. If the page has no menu text, return an empty menu_sections array.";

const MAP_SEARCH = "menu food dinner lunch dessert";
const SEVEN_DAYS = config.contextDev.maxAgeMs;

export class ContextDevError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string | null,
  ) {
    super(message);
  }
}

/* ----------------------------- response schemas ----------------------------- */

const MenuItemZ = z.object({
  name: z.string(),
  description: z.string().nullish(),
  price: z.string().nullish(),
  dietary_tags: z.array(z.string()).nullish(),
});
export const MenuZ = z.object({
  restaurant_name: z.string().nullish(),
  menu_sections: z.array(z.object({ section: z.string().nullish(), items: z.array(MenuItemZ).default([]) })).default([]),
});
const ImageZ = z.object({
  url: z.string(),
  alt: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  classification: z.string().nullish(),
});
const OutputZ = <T extends z.ZodTypeAny>(data: T) =>
  z
    .object({ requested: z.boolean().nullish(), success: z.boolean().nullish(), data: data.nullish(), error_code: z.string().nullish(), message: z.string().nullish() })
    .nullish();

const ScrapeZ = z.object({
  url: z.string().nullish(),
  json: OutputZ(z.unknown()),
  images: OutputZ(z.array(ImageZ)),
  parsed: OutputZ(z.object({ links: z.array(z.object({ url: z.string(), text: z.string().nullish() })).default([]) }).passthrough()),
  metadata: z.object({ title: z.string().nullish(), language: z.string().nullish() }).passthrough().nullish(),
  request_id: z.string().nullish(),
});
const MapZ = z.object({
  urls: z.array(z.object({ url: z.string(), title: z.string().nullish(), description: z.string().nullish() })).default([]),
  request_id: z.string().nullish(),
  partial: z.boolean().nullish(),
});
const AnswersZ = z.object({
  json_content: z
    .object({ venue_name: z.string().nullish(), address: z.string().nullish(), website_url: z.string().nullish(), confidence: z.number().nullish() })
    .passthrough()
    .nullish(),
  sources: z.array(z.string()).default([]),
  request_id: z.string().nullish(),
  partial: z.boolean().nullish(),
});

export type ScrapedImage = z.infer<typeof ImageZ>;
export type MenuScrape = {
  url: string;
  finalUrl: string | null;
  title: string | null;
  menu: z.infer<typeof MenuZ>;
  images: ScrapedImage[];
  requestId: string | null;
  jsonError: string | null;
};

/* ------------------------------- transport -------------------------------- */

/** Every request body we send (or would send, in replay). Used by the P10 test. */
export const contextDevWireLog: { op: string; body: unknown }[] = [];
let outOfCreditsUntil = 0;
let client: ContextDev | null = null;

function sdk(): ContextDev {
  if (!config.contextDevApiKey) throw new ContextDevError(401, "MISSING_KEY", "CONTEXT_DEV_API_KEY is not set (or run with DEMO_REPLAY=1)");
  if (!client) client = new ContextDev({ apiKey: config.contextDevApiKey, timeout: config.contextDev.timeoutMs, maxRetries: 0 });
  return client;
}

export function replayKey(op: string, ...parts: string[]): string {
  return [op, ...parts].join("|");
}

export function normaliseUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    let s = url.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return u.replace(/#.*$/, "").replace(/\/$/, "");
  }
}

export function domainOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

function toError(err: unknown): ContextDevError {
  if (err instanceof ContextDevError) return err;
  const e = err as { status?: number; error?: { error_code?: string; message?: string; request_id?: string }; message?: string };
  const status = typeof e?.status === "number" ? e.status : 0;
  const code = e?.error?.error_code ?? (status ? `HTTP_${status}` : "NETWORK");
  return new ContextDevError(status, code, e?.error?.message ?? e?.message ?? "Context.dev request failed", e?.error?.request_id ?? null);
}

/**
 * Executes one Context.dev request with replay/record, the documented error handling
 * (402 stop, 429 back off and retry, 408/500 one retry) and an audit entry (provider +
 * request id, never content).
 */
async function call<T>(op: string, key: string, body: unknown, exec: () => Promise<unknown>, parse: z.ZodType<T>, bookingId?: string | null): Promise<T> {
  contextDevWireLog.push({ op, body });
  if (contextDevWireLog.length > 1000) contextDevWireLog.shift();

  if (config.demoReplay) {
    const entry = getReplay<{ response: unknown }>("contextdev", key);
    if (!entry) throw new ReplayMissingError("contextdev", key);
    return parse.parse(entry.response);
  }
  if (Date.now() < outOfCreditsUntil) throw new ContextDevError(402, "USAGE_EXCEEDED", "Context.dev credits exhausted; enrichment paused");

  let lastErr: ContextDevError | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const raw = await exec();
      const parsed = parse.parse(raw);
      const requestId = (raw as { request_id?: string })?.request_id ?? null;
      await audit({ actor: "system", action: "external.contextdev", bookingId: bookingId ?? null, detail: { provider: "context.dev", op, request_id: requestId } });
      if (config.record) recordReplay("contextdev", key, { recorded_at: new Date().toISOString(), request: body, response: raw });
      return parsed;
    } catch (err) {
      const e = toError(err);
      lastErr = e;
      await audit({ actor: "system", action: "external.contextdev", bookingId: bookingId ?? null, detail: { provider: "context.dev", op, status: e.status, error_code: e.code, request_id: e.requestId ?? null } });
      if (e.status === 402) {
        outOfCreditsUntil = Date.now() + 10 * 60_000;
        throw e;
      }
      if (e.status === 429 && attempt < 3) {
        const retryAfter = Number(((err as { error?: { error_data?: { retry_after_seconds?: number } } })?.error?.error_data?.retry_after_seconds ?? 2)) || 2;
        await new Promise((r) => setTimeout(r, Math.min(30, retryAfter * (attempt + 1)) * 1000));
        continue;
      }
      if ((e.status === 408 || e.status >= 500 || e.status === 0) && attempt < 1) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new ContextDevError(0, "UNKNOWN", "Context.dev request failed");
}

/* --------------------------------- API ----------------------------------- */

export function venueTask(name: string, city: string): string {
  return `Find the official website of the food venue "${name}" in ${city}. Return the venue name, street address, official website (the venue's own site, not a review, delivery or booking site) and your confidence (0-1) that the website belongs to this venue.`;
}

/** Answers: venue name + city → official website (§7.6 VERIFY: preferred over Claude web search). */
export async function answersVenueWebsite(name: string, city: string, bookingId?: string | null) {
  const body = { mode: "fast", task: venueTask(name, city), json_format: { venue_name: "", address: "", website_url: "", confidence: 0 }, timeoutOpts: { milliseconds: 60_000, behavior: "return-partial" } };
  const r = await call("answers", replayKey("answers", name, city), body, () => sdk().web.answers(body as never), AnswersZ, bookingId);
  return {
    venueName: r.json_content?.venue_name ?? null,
    address: r.json_content?.address ?? null,
    websiteUrl: r.json_content?.website_url ?? null,
    confidence: r.json_content?.confidence ?? 0,
    sources: r.sources,
    requestId: r.request_id ?? null,
  };
}

/** Map: list a domain's URLs that look like menus. */
export async function mapDomain(domain: string, bookingId?: string | null) {
  const body = { domain, search: MAP_SEARCH, maxLinks: 15 };
  const r = await call("map", replayKey("map", domain), body, () => sdk().web.mapUrls(body as never), MapZ, bookingId);
  return { urls: r.urls, requestId: r.request_id ?? null };
}

/** Scrape with the prebuilt `links` parser: every link on the page with its anchor text. */
export async function scrapeLinks(url: string, bookingId?: string | null) {
  const body = { url, formats: { parse: true }, parseParams: { type: "prebuilt", parser: "links" }, maxAgeMs: SEVEN_DAYS };
  const r = await call("scrape_links", replayKey("links", normaliseUrl(url)), body, () => sdk().web.scrape(body as never), ScrapeZ, bookingId);
  return { links: r.parsed?.data?.links ?? [], title: r.metadata?.title ?? null, requestId: r.request_id ?? null };
}

function menuScrapeBody(url: string) {
  return {
    url,
    formats: { json: true, images: true },
    jsonParams: { schema: MENU_SCHEMA, instructions: MENU_INSTRUCTIONS },
    imageParams: { enrich: ["dimensions", "classification"], dedupe: "visual" },
    sharedParams: { parsers: { pdf: { ocr: "auto" } } },
    maxAgeMs: SEVEN_DAYS,
  };
}

function toMenuScrape(url: string, r: z.infer<typeof ScrapeZ>): MenuScrape {
  const jsonOk = r.json?.success !== false;
  const menu = MenuZ.safeParse(r.json?.data ?? { menu_sections: [] });
  return {
    url,
    finalUrl: r.url ?? null,
    title: r.metadata?.title ?? null,
    menu: menu.success ? cleanMenu(menu.data) : { menu_sections: [] },
    images: (r.images?.data ?? []).filter((i) => !i.url.startsWith("data:")),
    requestId: r.request_id ?? null,
    jsonError: jsonOk ? null : (r.json?.error_code ?? r.json?.message ?? "json extraction failed"),
  };
}

/** Normalises scraped menu values (e.g. Context.dev returns price ":null" when no price is shown). */
export function cleanMenu(m: z.infer<typeof MenuZ>): z.infer<typeof MenuZ> {
  const cleanPrice = (p: string | null | undefined) => {
    if (!p) return null;
    const t = p.trim().replace(/^:/, "");
    if (!t || /^(null|none|n\/a|-)$/i.test(t)) return null;
    return t;
  };
  return {
    restaurant_name: m.restaurant_name ?? null,
    menu_sections: m.menu_sections
      .map((s) => ({
        section: s.section ?? "",
        items: s.items
          .filter((i) => i.name && i.name.trim())
          .map((i) => ({ name: i.name.trim(), description: i.description?.trim() || null, price: cleanPrice(i.price), dietary_tags: i.dietary_tags ?? [] })),
      }))
      .filter((s) => s.items.length),
  };
}

/** Scrape one menu page into the §9.2 JSON schema, plus classified page images. */
export async function scrapeMenu(url: string, bookingId?: string | null): Promise<MenuScrape> {
  const body = menuScrapeBody(url);
  const r = await call("scrape_menu", replayKey("scrape", normaliseUrl(url)), body, () => sdk().web.scrape(body as never), ScrapeZ, bookingId);
  return toMenuScrape(url, r);
}

const BatchResultsZ = z.object({
  data: z
    .array(
      z.object({
        status: z.string(),
        url: z.string(),
        itemId: z.string().nullish(),
        result: z.unknown().nullish(),
        error_code: z.string().nullish(),
        message: z.string().nullish(),
      }),
    )
    .default([]),
  has_more: z.boolean().nullish(),
  next_cursor: z.string().nullish(),
});

/**
 * Many menu pages at once. Small sets are scraped directly in parallel (fast, for the live
 * demo); above CONTEXT_DEV_BATCH_THRESHOLD pages we submit one asynchronous Batch.
 */
export async function scrapeMenus(urls: string[], bookingId?: string | null): Promise<Map<string, MenuScrape | ContextDevError>> {
  const out = new Map<string, MenuScrape | ContextDevError>();
  const unique = [...new Set(urls)];
  if (!config.demoReplay && unique.length > config.contextDev.batchThreshold) {
    try {
      return await scrapeMenusBatch(unique, bookingId);
    } catch {
      // fall through to direct scraping
    }
  }
  const queue = [...unique];
  const workers = Array.from({ length: config.contextDev.concurrency }, async () => {
    while (queue.length) {
      const u = queue.shift()!;
      try {
        out.set(u, await scrapeMenu(u, bookingId));
      } catch (e) {
        out.set(u, e instanceof ContextDevError ? e : toError(e));
        if (e instanceof ReplayMissingError) out.set(u, new ContextDevError(0, "REPLAY_MISSING", e.message));
      }
    }
  });
  await Promise.all(workers);
  return out;
}

async function scrapeMenusBatch(urls: string[], bookingId?: string | null): Promise<Map<string, MenuScrape | ContextDevError>> {
  const c = sdk();
  const shared = menuScrapeBody("");
  const submit = {
    input: {
      mode: "scrape",
      data: {
        urls: urls.map((url, i) => ({ url, itemId: String(i) })),
        formats: shared.formats,
        jsonParams: shared.jsonParams,
        imageParams: shared.imageParams,
        sharedParams: shared.sharedParams,
        maxAgeMs: shared.maxAgeMs,
      },
    },
    tags: ["wedding-food-memory", "menus"],
  };
  contextDevWireLog.push({ op: "batch_submit", body: submit });
  const batch = (await c.batch.submit(submit as never)) as unknown as { id: string; request_id?: string };
  await audit({ actor: "system", action: "external.contextdev", bookingId: bookingId ?? null, detail: { provider: "context.dev", op: "batch_submit", batch_id: batch.id, request_id: batch.request_id ?? null, pages: urls.length } });

  const deadline = Date.now() + 15 * 60_000;
  let status = "queued";
  while (!["completed", "failed", "cancelled"].includes(status)) {
    if (Date.now() > deadline) throw new ContextDevError(408, "BATCH_TIMEOUT", "batch did not finish in 15 minutes");
    await new Promise((r) => setTimeout(r, 5000));
    status = ((await c.batch.retrieve(batch.id)) as unknown as { status: string }).status;
  }
  const out = new Map<string, MenuScrape | ContextDevError>();
  let cursor: string | undefined;
  do {
    const page = BatchResultsZ.parse(await c.batch.getResults(batch.id, cursor ? { cursor } : undefined));
    for (const rec of page.data) {
      const url = urls[Number(rec.itemId)] ?? rec.url;
      if (rec.status !== "ok") {
        out.set(url, new ContextDevError(0, rec.error_code ?? "PAGE_ERROR", rec.message ?? "page failed"));
        continue;
      }
      const parsed = ScrapeZ.safeParse(rec.result);
      out.set(url, parsed.success ? toMenuScrape(url, parsed.data) : new ContextDevError(0, "BAD_RESULT", "unexpected batch result shape"));
      if (config.record && parsed.success) recordReplay("contextdev", replayKey("scrape", normaliseUrl(url)), { recorded_at: new Date().toISOString(), request: { batch: batch.id, url }, response: rec.result });
    }
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

export function resetContextDevForTests() {
  contextDevWireLog.length = 0;
  outOfCreditsUntil = 0;
}
