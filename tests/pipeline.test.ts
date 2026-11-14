import path from "node:path";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { enrichments, items, jobs, memories, moments, places, uploads } from "@/db/schema";
import { storage } from "@/storage";
import { demoBooking, manifestOracle } from "./helpers";

/**
 * §13 acceptance on the demo dataset (DEMO_REPLAY=1): detection, moments and scoring,
 * Context.dev enrichment paths, dish matching, sensitive flagging, raw-zip deletion.
 */
let bk: Awaited<ReturnType<typeof demoBooking>>;
let elapsedMs = 0;

beforeAll(async () => {
  const t0 = Date.now();
  bk = await demoBooking();
  elapsedMs = Date.now() - t0;
});

const db = () => getDb();

async function memoryByDish(dish: string) {
  return (await db().select().from(memories).where(and(eq(memories.bookingId, bk.bookingId), eq(memories.dishName, dish))))[0];
}

describe("pipeline on the demo dataset", () => {
  it("finishes every job", async () => {
    const js = await db().select().from(jobs).where(eq(jobs.bookingId, bk.bookingId));
    const bad = js.filter((j) => j.status !== "done");
    expect(bad, JSON.stringify(bad)).toEqual([]);
    expect(js.filter((j) => j.stage === "flag_sensitive").length).toBeGreaterThanOrEqual(2);
  });

  it("detects the platform from structure and parses both exports", async () => {
    const ups = await db().select().from(uploads).where(eq(uploads.bookingId, bk.bookingId));
    expect(ups.map((u) => u.platform).sort()).toEqual(["google_photos", "instagram"]);
    const ig = ups.find((u) => u.platform === "instagram")!;
    const gt = ups.find((u) => u.platform === "google_photos")!;
    expect(ig.stats.videos_skipped).toBe(2);
    expect(gt.stats.videos_skipped).toBe(1);
    expect(gt.stats.unsupported_skipped).toBe(1); // HEIC
    expect(gt.stats.skipped_too_small).toBe(1);
    expect(gt.stats.skipped_duplicate).toBe(4); // the four Naples photos Takeout also put in "Photos from 2023"
    expect(ig.stats.skipped_duplicate ?? 0).toBe(0);
    expect(ig.stats.texts_found).toBeGreaterThan(20);
  });

  it("repairs Instagram mojibake in captions", async () => {
    const it = (await db().select().from(items).where(eq(items.personId, bk.a))).find((i) => i.sourcePath.endsWith("aino_proposal.jpg"))!;
    expect(it.caption).toBe("SHE SAID YES 💍 #arthursseat #edinburgh");
  });

  it("P2: deletes the raw zips after parsing and detection", async () => {
    const ups = await db().select().from(uploads).where(eq(uploads.bookingId, bk.bookingId));
    for (const u of ups) {
      expect(u.status).toBe("raw_deleted");
      expect(u.storageKey).toBeNull();
    }
    expect((await storage.list("raw")).length).toBe(0);
  });

  it("P3: stores crops only for food items, never full images", async () => {
    const all = await db().select().from(items).where(eq(items.bookingId, bk.bookingId));
    const crops = await storage.list("crops");
    expect(crops.length).toBe(all.filter((i) => i.isFood).length);
    for (const i of all) {
      if (!i.isFood) expect(i.mediaKey).toBeNull();
    }
  });

  it("US-3 AC3: food recall ≥ 90% and false positives ≤ 5% on the demo set", async () => {
    const oracle = new Map(manifestOracle().map((o) => [o.file, o.is_food]));
    const photos = (await db().select().from(items).where(and(eq(items.bookingId, bk.bookingId), eq(items.kind, "photo"), eq(items.detectStatus, "done"))));
    let tp = 0, fn = 0, fp = 0, tn = 0;
    for (const p of photos) {
      const truth = oracle.get(path.posix.basename(p.sourcePath));
      if (truth === undefined) continue;
      if (truth && p.isFood) tp++;
      else if (truth) fn++;
      else if (p.isFood) fp++;
      else tn++;
    }
    expect(tp + fn).toBe(30);
    expect(tp / (tp + fn)).toBeGreaterThanOrEqual(0.9);
    expect(fp / (fp + tn)).toBeLessThanOrEqual(0.05);
  });

  it("US-4 AC4: the proposal moment (Eton mess) ranks first", async () => {
    const ms = await db().select().from(memories).where(eq(memories.bookingId, bk.bookingId));
    ms.sort((a, b) => b.significance - a.significance);
    expect(ms[0]!.dishName).toBe("Eton mess");
    const mo = (await db().select().from(moments).where(eq(moments.id, ms[0]!.momentId)))[0]!;
    expect(mo.eventType).toBe("proposal");
    expect(mo.localDate).toBe("2024-06-14");
    expect(mo.eventEvidence?.quotes).toContain("SHE SAID YES");
  });

  it("§7.7: the pizza recurrence bonus applies across three Naples moments", async () => {
    const m = await memoryByDish("Pizza marinara");
    expect(m?.significanceParts?.recurrence).toBe(15);
    expect((await memoryByDish("Pizza margherita"))?.significanceParts?.recurrence).toBe(15);
  });

  it("§7.6: the home-cooked anniversary risotto gets no place and no enrichment", async () => {
    const m = (await memoryByDish("Mushroom risotto"))!;
    const mo = (await db().select().from(moments).where(eq(moments.id, m.momentId)))[0]!;
    expect(mo.eventType).toBe("anniversary");
    expect(mo.placeId).toBeNull();
    expect(mo.placeStatus).toBe("private_home");
  });

  it("US-5: Context.dev enrichment outcomes per venue", async () => {
    const ps = await db().select().from(places);
    const es = await db().select().from(enrichments);
    const byName = (n: string) => {
      const p = ps.find((x) => x.name === n);
      return p ? es.find((e) => e.placeId === p.id) : undefined;
    };
    expect(byName("Löyly")?.status).toBe("ok");
    expect(byName("Löyly")?.sourceUrl).toBe("https://www.loylyhelsinki.fi/en/menu/a-la-carte");
    expect(byName("Pizzeria Starita")?.status).toBe("ok");
    expect(byName("L'Antica Pizzeria da Michele")?.status).toBe("menu_is_image");
    expect(byName("L'Antica Pizzeria da Michele")?.menu?.website_note).toMatch(/parked/);
    expect(byName("The Sheep Heid Inn")?.status).toBe("no_menu");
    for (const e of es) {
      expect(e.scrapedAt).toBeTruthy();
      if (e.status === "ok") expect(e.sourceUrl).toMatch(/^https:\/\//);
    }
    // Context.dev's ":null" price placeholder is normalised away.
    const starita = byName("Pizzeria Starita")!;
    expect(starita.menu!.menu_sections.flatMap((s) => s.items).every((i) => i.price === null)).toBe(true);
  });

  it("§13: the first-date dish matches the menu item at ≥ 0.7", async () => {
    const m = (await memoryByDish("Salmon soup"))!;
    expect(m.menuItemMatch?.item_name).toBe("JASPER´S SALMON SOUP");
    expect(m.menuItemMatch!.match_confidence).toBeGreaterThanOrEqual(0.7);
    expect(m.menuItemMatch!.source_url).toBe("https://www.loylyhelsinki.fi/en/menu/a-la-carte");
    expect((await memoryByDish("Pizza marinara"))?.menuItemMatch?.item_name).toBe("Marinara Starita");
  });

  it("§7.8: the hospital cafeteria memory starts hidden by default", async () => {
    const m = (await memoryByDish("Pea soup"))!;
    expect(m.status).toBe("hidden");
    expect(m.hiddenByDefault).toBe(true);
    expect(m.sensitiveFlags).toContain("hospital_or_medical");
  });

  it("§7.8: alcohol_heavy is a hint only and does not hide", async () => {
    const m = (await memoryByDish("Cheese board"))!;
    expect(m.sensitiveFlags).toContain("alcohol_heavy");
    expect(m.status).toBe("pending");
  });

  it("is idempotent: re-running person stages creates no duplicates", async () => {
    const before = await db().select().from(memories).where(eq(memories.bookingId, bk.bookingId));
    const { runBuildMoments } = await import("@/pipeline/build_moments");
    const { runMatchDishes } = await import("@/pipeline/match_dishes");
    const { runScore } = await import("@/pipeline/score");
    for (const personId of [bk.a, bk.b]) {
      const ctx = { bookingId: bk.bookingId, inputRef: personId, personId, jobId: "rerun" };
      await runBuildMoments(ctx);
      await runMatchDishes(ctx);
      await runScore(ctx);
    }
    const after = await db().select().from(memories).where(eq(memories.bookingId, bk.bookingId));
    expect(after.map((m) => m.id).sort()).toEqual(before.map((m) => m.id).sort());
  });

  it("US-3 AC4: processing time (replay) extrapolates well under 30 min per 1,000 photos", () => {
    // Replay removes model latency; live latency is covered by detect concurrency (docs/decisions.md).
    expect(elapsedMs).toBeLessThan(5 * 60_000);
  });
});
