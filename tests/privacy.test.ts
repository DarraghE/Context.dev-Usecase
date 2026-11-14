import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { auditLog, bookings, consents, items, jobs, memories, people, uploads } from "@/db/schema";
import { contextDevWireLog } from "@/integrations/contextdev";
import { chefList, reviewAction, reviewList } from "@/lib/memories";
import { ConsentRequiredError } from "@/lib/uploads";
import { redactNames } from "@/pipeline/extract_text";
import { preprocess } from "@/pipeline/preprocess";
import { runUntilIdle } from "@/pipeline/runner";
import { BLUR_SIGMA, blurFaces, regionVariance, type Box } from "@/privacy/blur";
import { runDailyDeletion, sweepRawZips, withdrawConsent } from "@/privacy/deletion";
import { signMediaUrl, verifyMediaRequest } from "@/privacy/media";
import { loadPrompt } from "@/prompts";
import { keys, storage } from "@/storage";
import { COUPLE } from "../scripts/fixtures/manifest";
import { consent, demoBooking, freshBooking, uploadFixture } from "./helpers";

/** §10: one automated test per privacy requirement (P1–P13). */
let bk: Awaited<ReturnType<typeof demoBooking>>;
beforeAll(async () => {
  bk = await demoBooking();
});
const db = () => getDb();
const mem = async (dish: string) => (await db().select().from(memories).where(and(eq(memories.bookingId, bk.bookingId), eq(memories.dishName, dish))))[0]!;
const parseUrl = (u: string) => {
  const url = new URL(u, "http://x");
  return { encodedKey: url.pathname.split("/").pop()!, scope: url.searchParams.get("s"), exp: url.searchParams.get("e"), sig: url.searchParams.get("sig") };
};

describe("P1 — no processing before consent", () => {
  it("rejects uploads from a partner who has not consented", async () => {
    const b = await freshBooking();
    await expect(uploadFixture(b.a, b.bookingId, "instagram_legacy.zip")).rejects.toBeInstanceOf(ConsentRequiredError);
    expect(await db().select().from(uploads).where(eq(uploads.personId, b.a))).toHaveLength(0);
  });

  it("stops queued jobs when consent is no longer live", async () => {
    const b = await freshBooking();
    await consent(b.a, b.bookingId);
    const up = await uploadFixture(b.a, b.bookingId, "instagram_legacy.zip");
    await db().update(consents).set({ withdrawnAt: new Date().toISOString() }).where(eq(consents.personId, b.a));
    await runUntilIdle();
    const js = await db().select().from(jobs).where(eq(jobs.inputRef, up.id));
    expect(js[0]?.status).toBe("failed");
    expect(js[0]?.error).toMatch(/consent/);
    expect(await db().select().from(items).where(eq(items.personId, b.a))).toHaveLength(0);
  });

  it("processes one partner's data on their own consent (US-1 AC5)", async () => {
    const b = await freshBooking();
    await consent(b.a, b.bookingId);
    await uploadFixture(b.a, b.bookingId, "instagram_legacy.zip");
    await runUntilIdle();
    expect((await db().select().from(items).where(eq(items.personId, b.a))).length).toBeGreaterThan(0);
  });
});

describe("P2 — raw zips are deleted", () => {
  it("deletes the zip after parsing and detection", async () => {
    for (const id of Object.values(bk.uploads)) {
      const u = (await db().select().from(uploads).where(eq(uploads.id, id)))[0]!;
      expect(u.status).toBe("raw_deleted");
      expect(u.storageKey).toBeNull();
    }
    expect(await storage.list(`raw/${bk.a}`)).toHaveLength(0);
    expect(await storage.list(`raw/${bk.b}`)).toHaveLength(0);
  });

  it("sweeps any zip older than 24 h even if processing stalled", async () => {
    const b = await freshBooking();
    await consent(b.a, b.bookingId);
    const up = await uploadFixture(b.a, b.bookingId, "instagram_legacy.zip"); // not processed
    const old = new Date(Date.now() - 25 * 3600_000).toISOString();
    await db().update(uploads).set({ createdAt: old }).where(eq(uploads.id, up.id));
    expect(storage.exists(keys.raw(b.a, up.id))).toBe(true);
    expect(await sweepRawZips()).toBe(1);
    expect(storage.exists(keys.raw(b.a, up.id))).toBe(false);
    await db().delete(jobs).where(eq(jobs.inputRef, up.id));
  });
});

describe("P3 — full-size originals are never stored", () => {
  it("keeps only food crops, one per food photo, smaller than the original", async () => {
    const files = await storage.list("");
    const imgs = files.filter((f) => /\.(jpe?g|png)$/i.test(f.key));
    expect(imgs.every((f) => f.key.startsWith("crops/") || f.key.startsWith("chef/"))).toBe(true);
    const food = await db().select().from(items).where(and(eq(items.bookingId, bk.bookingId), eq(items.isFood, true)));
    expect(imgs.filter((f) => f.key.startsWith(`crops/${bk.a}/`) || f.key.startsWith(`crops/${bk.b}/`))).toHaveLength(food.length);
    for (const i of food.slice(0, 5)) {
      const meta = await sharp((await storage.get(i.mediaKey!))!).metadata();
      expect((meta.width ?? 0) * (meta.height ?? 0)).toBeLessThan(800 * 600);
    }
  });
});

describe("P4 — EXIF is stripped", () => {
  it("removes EXIF (including GPS) in preprocessing and in stored crops", async () => {
    const withExif = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#c33" } })
      .withExif({ IFD0: { Copyright: "secret-owner", Artist: "Someone" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const pre = await preprocess(withExif);
    expect((await sharp(pre.jpeg).metadata()).exif).toBeUndefined();
    const crop = (await db().select().from(items).where(and(eq(items.bookingId, bk.bookingId), eq(items.isFood, true))))[0]!;
    expect((await sharp((await storage.get(crop.mediaKey!))!).metadata()).exif).toBeUndefined();
  });
});

describe("P5 — the chef sees approved memories only", () => {
  it("returns approved and never pending, hidden or sensitive data", async () => {
    const approved = await mem("Salmon soup");
    const hidden = await mem("Rye bread");
    await reviewAction(bk.b, approved.id, { type: "approve" });
    await reviewAction(bk.b, hidden.id, { type: "hide" });
    const list = await chefList(bk.bookingId, bk.chef, "ranked", { audit: false });
    const ids = list.map((m) => m.id);
    expect(ids).toContain(approved.id);
    expect(ids).not.toContain(hidden.id);
    const all = await db().select().from(memories).where(eq(memories.bookingId, bk.bookingId));
    for (const m of all) if (m.status !== "approved") expect(ids).not.toContain(m.id);
    const json = JSON.stringify(list);
    expect(json).not.toMatch(/sensitive|hospital|personId|person_id|partner_|@example\.com/);
    expect(json).not.toContain((await mem("Pea soup")).id);
  });

  it("a partner cannot act on the other partner's memories", async () => {
    const theirs = await mem("Eton mess"); // Aino's
    expect(await reviewAction(bk.b, theirs.id, { type: "approve" })).toBeNull();
    expect((await reviewList(bk.b)).some((m) => m.id === theirs.id)).toBe(false);
  });
});

describe("P6 — chef images have faces blurred", () => {
  it("blurs the detected face region in the chef derivative (variance drops)", async () => {
    const m = await mem("Eton mess");
    await reviewAction(bk.a, m.id, { type: "approve" });
    const fresh = (await db().select().from(memories).where(eq(memories.id, m.id)))[0]!;
    expect(fresh.chefImageKey).toBe(keys.chef(m.id));
    const item = (await db().select().from(items).where(eq(items.id, m.sourceItemId!)))[0]!;
    const faces = item.food!.faces_in_crop as Box[];
    expect(faces.length).toBeGreaterThan(0);
    const crop = (await storage.get(item.mediaKey!))!;
    const chef = (await storage.get(fresh.chefImageKey!))!;
    const before = await regionVariance(crop, faces[0]!);
    const after = await regionVariance(chef, faces[0]!);
    expect(after).toBeLessThan(before * 0.5);
    expect(BLUR_SIGMA).toBeGreaterThanOrEqual(20);
  });

  it("gives the chef no image when face detection failed", async () => {
    const crop = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#888" } }).jpeg().toBuffer();
    expect(await blurFaces(crop, null)).toBeNull();
    expect(await blurFaces(crop, undefined)).toBeNull();
  });
});

describe("P7 — no face recognition or identity inference", () => {
  it("instructs the model never to identify people and has no identity fields", async () => {
    const p = loadPrompt("food_detect").text;
    expect(p).toMatch(/Never identify, name or describe who a person is/);
    const { DETECT_SCHEMA } = await import("@/pipeline/detect_food");
    const keysOf = JSON.stringify(DETECT_SCHEMA);
    expect(keysOf).not.toMatch(/"(name|person|identity|age|gender|ethnicity)"\s*:/);
  });
});

describe("P8 — other people's comments are never shown", () => {
  it("uses a friend's comment for food mentions but never returns its text", async () => {
    const b = await freshBooking();
    await consent(b.b, b.bookingId);
    await uploadFixture(b.b, b.bookingId, "facebook_variant.zip");
    await runUntilIdle();
    const its = await db().select().from(items).where(eq(items.personId, b.b));
    const comment = its.find((i) => i.kind === "comment")!;
    expect(comment.authoredByOther).toBe(true);
    const out = JSON.stringify(await reviewList(b.b));
    expect(out).not.toContain("That soup looks amazing");
  });
});

describe("P9 — deletion", () => {
  it("deletes every booking past delete_after, including storage, and logs counts", async () => {
    const b = await freshBooking({ weddingDate: "2020-01-01" });
    await consent(b.a, b.bookingId);
    await uploadFixture(b.a, b.bookingId, "aino_instagram.zip");
    await runUntilIdle();
    expect((await storage.list(`crops/${b.a}`)).length).toBeGreaterThan(0);
    const r = await runDailyDeletion("2026-11-14");
    expect(r.bookings).toBeGreaterThanOrEqual(1);
    const booking = (await db().select().from(bookings).where(eq(bookings.id, b.bookingId)))[0]!;
    expect(booking.status).toBe("deleted");
    expect(await db().select().from(people).where(eq(people.bookingId, b.bookingId))).toHaveLength(0);
    expect(await storage.list(`crops/${b.a}`)).toHaveLength(0);
    const log = await db().select().from(auditLog).where(and(eq(auditLog.action, "deletion.booking"), eq(auditLog.bookingId, b.bookingId)));
    expect((log[0]?.detail as { counts: Record<string, number> }).counts.items).toBeGreaterThan(0);
  });

  it("withdrawal deletes uploads, memories and links well within 5 minutes", async () => {
    const b = await freshBooking();
    await consent(b.a, b.bookingId);
    await uploadFixture(b.a, b.bookingId, "aino_instagram.zip");
    await runUntilIdle();
    expect((await db().select().from(memories).where(eq(memories.personId, b.a))).length).toBeGreaterThan(0);
    const t0 = Date.now();
    const counts = await withdrawConsent(b.a);
    expect(Date.now() - t0).toBeLessThan(5 * 60_000);
    expect(counts.memories).toBeGreaterThan(0);
    for (const t of [memories, items, uploads]) expect(await db().select().from(t).where(eq(t.personId, b.a))).toHaveLength(0);
    expect(await storage.list(`crops/${b.a}`)).toHaveLength(0);
    expect(await db().select().from(auditLog).where(and(eq(auditLog.action, "deletion.withdrawal"), eq(auditLog.targetId, b.a)))).toHaveLength(1);
  });
});

describe("P10 — external calls carry only what each stage needs", () => {
  it("sends Context.dev only venue names, cities, domains and public URLs", () => {
    expect(contextDevWireLog.length).toBeGreaterThan(0);
    const wire = JSON.stringify(contextDevWireLog);
    expect(wire).not.toMatch(/-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/); // no coordinates
    expect(wire).not.toMatch(/latitude|longitude|"lat"|"lng"/);
    expect(wire).not.toMatch(/@example\.com|Aino|Sam Carter|Laine/);
    expect(wire).not.toMatch(/20(21|22|23|24|25)-\d{2}-\d{2}/); // no memory dates
    for (const c of contextDevWireLog) {
      const u = (c.body as { url?: string }).url;
      if (u) expect(u).toMatch(/^https:\/\//);
    }
  });

  it("replaces partner names in captions before they go to Claude", () => {
    const names = [COUPLE.partnerA.name, COUPLE.partnerB.name, COUPLE.partnerA.email, COUPLE.chef.name];
    expect(redactNames("Sam's 30th 🎂 with Aino Laine", names)).toBe("[partner]'s 30th 🎂 with [partner]");
    expect(redactNames("Samurai sword", names)).toBe("Samurai sword");
  });
});

describe("P11 — signed media URLs", () => {
  it("expire after 5 minutes and are bound to the viewer's role and key", () => {
    const key = `crops/${bk.a}/x.jpg`;
    const now = Date.now();
    const u = parseUrl(signMediaUrl(key, "partner", 300, now));
    expect(verifyMediaRequest(u, { role: "partner_a", personId: bk.a }, now).ok).toBe(true);
    expect(verifyMediaRequest(u, { role: "partner_a", personId: bk.a }, now + 301_000)).toMatchObject({ ok: false, status: 410 });
    expect(verifyMediaRequest(u, { role: "partner_b", personId: bk.b }, now)).toMatchObject({ ok: false, status: 403 });
    expect(verifyMediaRequest(u, { role: "chef", personId: bk.chef }, now)).toMatchObject({ ok: false, status: 403 });
    expect(verifyMediaRequest({ ...u, sig: u.sig!.slice(0, -2) + "xx" }, { role: "partner_a", personId: bk.a }, now).ok).toBe(false);
    // A chef URL may only point at a blurred derivative.
    const forged = parseUrl(signMediaUrl(key, "chef", 300, now));
    expect(verifyMediaRequest(forged, { role: "chef", personId: bk.chef }, now)).toMatchObject({ ok: false, status: 403 });
    const good = parseUrl(signMediaUrl(keys.chef("01a1db7b-b40c-7382-8c46-610f8759b7d8"), "chef", 300, now));
    expect(verifyMediaRequest(good, { role: "chef", personId: bk.chef }, now).ok).toBe(true);
  });
});

describe("P12 — chef access is audited", () => {
  it("logs every memory the chef API returns", async () => {
    const list = await chefList(bk.bookingId, bk.chef, "timeline");
    const logs = await db().select().from(auditLog).where(and(eq(auditLog.action, "chef.memory_viewed"), eq(auditLog.actor, bk.chef)));
    const last = logs.at(-1)!;
    expect((last.detail as { memory_ids: string[] }).memory_ids.sort()).toEqual(list.map((m) => m.id).sort());
  });
});

describe("P13 — GDPR roles are documented", () => {
  it("docs/privacy.md names the caterer as controller and this service as processor, with EU hosting", () => {
    const doc = fs.readFileSync(path.resolve("docs", "privacy.md"), "utf8");
    expect(doc).toMatch(/controller/i);
    expect(doc).toMatch(/processor/i);
    expect(doc).toMatch(/\bEU\b/);
  });
});
