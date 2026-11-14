import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Runs the demo dataset through the LIVE pipeline (real Claude + Context.dev calls) in a
 * throwaway database. Used by `npm run test:accuracy` (§13 detection check, AC4 timing)
 * and `npm run replay:record` (RECORD=1: lock the live responses into fixtures/replay/).
 */
export async function liveRun(opts: { record: boolean; menu: boolean }) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw new Error("ANTHROPIC_API_KEY is required for a live run");
  if (!process.env.CONTEXT_DEV_API_KEY) console.warn("CONTEXT_DEV_API_KEY not set: enrichment will record errors (pipeline continues).");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wfm-live-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "live.db").replace(/\\/g, "/")}`;
  process.env.STORAGE_DIR = path.join(dir, "storage");
  process.env.DEMO_REPLAY = "0";
  process.env.RECORD = opts.record ? "1" : "0";

  const { ensureMigrated, getDb } = await import("../src/db/client");
  const { createBooking, ensureCaterer, ensureCatererAdmin } = await import("../src/lib/bookings");
  const { grantConsent, loadConsentContext } = await import("../src/privacy/consent");
  const { registerUpload } = await import("../src/lib/uploads");
  const { runUntilIdle, setAutoStart } = await import("../src/pipeline/runner");
  const { items, memories } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { COUPLE } = await import("./fixtures/manifest");
  setAutoStart(false);
  await ensureMigrated();

  const catererId = await ensureCaterer("Live check");
  const adminId = await ensureCatererAdmin(catererId, "live@example.invalid", "Live");
  const b = await createBooking(
    { coupleDisplayName: COUPLE.name, weddingDate: COUPLE.weddingDate, partnerA: COUPLE.partnerA, partnerB: COUPLE.partnerB, chef: COUPLE.chef, dietary: { allergies: COUPLE.dietary.allergies, diets: COUPLE.dietary.diets, notes: COUPLE.dietary.notes }, defaultTz: "Europe/Helsinki" },
    catererId,
    adminId,
  );
  const { people } = await import("../src/db/schema");
  const ppl = await getDb().select().from(people).where(eq(people.bookingId, b.bookingId));
  const t0 = Date.now();
  for (const [role, file] of [["partner_a", "aino_instagram.zip"], ["partner_b", "sam_google_takeout.zip"]] as const) {
    const p = ppl.find((x) => x.role === role)!;
    const ctx = (await loadConsentContext(p.id))!;
    await grantConsent({ personId: p.id, bookingId: b.bookingId, text: ctx.text, ip: "127.0.0.1", relationshipStartDate: COUPLE.relationshipStart });
    const tmp = path.join(dir, `${role}.zip`);
    await fsp.copyFile(path.resolve("fixtures", "exports", file), tmp);
    await registerUpload({ personId: p.id, bookingId: b.bookingId, srcPath: tmp, originalName: file });
  }
  await runUntilIdle(60 * 60_000);
  const elapsedMs = Date.now() - t0;

  const photos = (await getDb().select().from(items).where(eq(items.bookingId, b.bookingId))).filter((i) => i.kind === "photo" && i.detectStatus === "done");
  if (opts.menu) {
    const { reviewAction } = await import("../src/lib/memories");
    const { generateMenu } = await import("../src/menu/generate");
    for (const m of await getDb().select().from(memories).where(eq(memories.bookingId, b.bookingId))) if (m.status === "pending") await reviewAction(m.personId, m.id, { type: "approve" });
    await generateMenu(b.bookingId, ppl.find((x) => x.role === "chef")!.id);
  }
  return { bookingId: b.bookingId, photos, elapsedMs };
}
