import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * §13 Context.dev: a contract test against the recorded responses, error handling for
 * 402/429/408 with a mocked SDK, and a live smoke test behind LIVE=1.
 */
const recorded = JSON.parse(fs.readFileSync(path.resolve("fixtures", "replay", "contextdev.json"), "utf8")).entries as Record<string, { request: unknown; response: unknown; recorded_at: string }>;

describe("contract: recorded Context.dev responses", () => {
  it("every recording parses with the integration's schemas", async () => {
    const cd = await import("@/integrations/contextdev");
    const keys = Object.keys(recorded);
    expect(keys.length).toBeGreaterThanOrEqual(15);
    for (const k of keys) {
      const op = k.split("|")[0];
      if (op === "scrape") {
        const r = await cd.scrapeMenu(k.slice("scrape|".length));
        expect(r.requestId).toMatch(/^[0-9a-f-]{36}$/);
      } else if (op === "map") {
        const r = await cd.mapDomain(k.split("|")[1]!);
        expect(Array.isArray(r.urls)).toBe(true);
      } else if (op === "links") {
        const r = await cd.scrapeLinks(k.slice("links|".length));
        expect(Array.isArray(r.links)).toBe(true);
      } else if (op === "answers") {
        const [, name, city] = k.split("|");
        const r = await cd.answersVenueWebsite(name!, city!);
        expect(r.requestId).toBeTruthy();
      }
    }
  });

  it("extracts the Löyly menu and normalises Starita's ':null' prices", async () => {
    const cd = await import("@/integrations/contextdev");
    const loyly = await cd.scrapeMenu("https://www.loylyhelsinki.fi/en/menu/a-la-carte");
    const all = loyly.menu.menu_sections.flatMap((s) => s.items);
    expect(all.length).toBe(21);
    expect(all.find((i) => i.name === "JASPER´S SALMON SOUP")?.price).toBe("24");
    expect(loyly.images.find((i) => i.classification === "logo")?.url).toMatch(/loyly-logo/);
    const starita = await cd.scrapeMenu("https://pizzeriestarita.it/en/menu");
    expect(starita.menu.menu_sections.flatMap((s) => s.items).every((i) => i.price === null)).toBe(true);
  });

  it("builds the place lookup from a venue name and city only", async () => {
    const cd = await import("@/integrations/contextdev");
    expect(cd.venueTask("Löyly", "Helsinki, Finland")).toBe((recorded["answers|Löyly|Helsinki, Finland"]!.request as { task: string }).task);
  });
});

describe("error handling (mocked SDK, live mode)", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("context.dev");
    process.env.DEMO_REPLAY = "1";
    delete process.env.CONTEXT_DEV_API_KEY;
  });

  async function withMock(scrape: (...a: unknown[]) => Promise<unknown>) {
    vi.resetModules();
    vi.doMock("context.dev", () => ({ default: class { web = { scrape, mapUrls: scrape, answers: scrape }; } }));
    process.env.DEMO_REPLAY = "0";
    process.env.CONTEXT_DEV_API_KEY = "test-key";
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await (await import("@/db/client")).ensureMigrated();
    const mod = await import("@/integrations/contextdev");
    mod.resetContextDevForTests();
    return mod;
  }
  const apiError = (status: number, error_code: string, extra: object = {}) => Object.assign(new Error(error_code), { status, error: { error_code, message: error_code, request_id: "req-1", ...extra } });
  const ok = { url: "https://x.example/menu", json: { requested: true, success: true, data: { menu_sections: [{ section: "Mains", items: [{ name: "Soup" }] }] } }, request_id: "11111111-1111-1111-1111-111111111111" };

  it("429: backs off and retries", async () => {
    const scrape = vi.fn().mockRejectedValueOnce(apiError(429, "RATE_LIMITED", { error_data: { retry_after_seconds: 0.01 } })).mockResolvedValueOnce(ok);
    const cd = await withMock(scrape);
    const r = await cd.scrapeMenu("https://x.example/menu");
    expect(r.menu.menu_sections[0]!.items[0]!.name).toBe("Soup");
    expect(scrape).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("402: stops immediately and pauses further calls", async () => {
    const scrape = vi.fn().mockRejectedValue(apiError(402, "USAGE_EXCEEDED"));
    const cd = await withMock(scrape);
    await expect(cd.scrapeMenu("https://x.example/menu")).rejects.toMatchObject({ status: 402 });
    await expect(cd.scrapeMenu("https://x.example/other")).rejects.toMatchObject({ status: 402 });
    expect(scrape).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("408: retries once, then reports a timeout", async () => {
    const scrape = vi.fn().mockRejectedValue(apiError(408, "REQUEST_TIMEOUT"));
    const cd = await withMock(scrape);
    await expect(cd.scrapeMenu("https://x.example/menu")).rejects.toMatchObject({ status: 408 });
    expect(scrape).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe.runIf(process.env.LIVE === "1" && !!process.env.CONTEXT_DEV_API_KEY)("live smoke test (LIVE=1)", () => {
  it("scrapes the Löyly menu from the live API", async () => {
    const cd = await import("@/integrations/contextdev");
    const r = await cd.scrapeMenu("https://www.loylyhelsinki.fi/en/menu/a-la-carte");
    expect(r.menu.menu_sections.length).toBeGreaterThan(0);
  });
});
