import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { ensureMigrated } from "@/db/client";
import { createBooking, ensureCaterer, ensureCatererAdmin } from "@/lib/bookings";
import { newId } from "@/lib/ids";
import { registerUpload } from "@/lib/uploads";
import { runUntilIdle, setAutoStart } from "@/pipeline/runner";
import { grantConsent, loadConsentContext } from "@/privacy/consent";
import { getDb } from "@/db/client";
import { people } from "@/db/schema";
import { eq } from "drizzle-orm";
import { COUPLE } from "../scripts/fixtures/manifest";

setAutoStart(false);

export async function freshBooking(overrides: Partial<{ allergies: string[]; weddingDate: string }> = {}) {
  await ensureMigrated();
  const catererId = await ensureCaterer("Test Caterer");
  const adminId = await ensureCatererAdmin(catererId, "admin@test.example", "Admin");
  const b = await createBooking(
    {
      coupleDisplayName: COUPLE.name,
      weddingDate: overrides.weddingDate ?? COUPLE.weddingDate,
      partnerA: COUPLE.partnerA,
      partnerB: COUPLE.partnerB,
      chef: COUPLE.chef,
      dietary: { allergies: overrides.allergies ?? COUPLE.dietary.allergies, diets: COUPLE.dietary.diets, notes: COUPLE.dietary.notes },
      defaultTz: "Europe/Helsinki",
    },
    catererId,
    adminId,
  );
  const ppl = await getDb().select().from(people).where(eq(people.bookingId, b.bookingId));
  const byRole = Object.fromEntries(ppl.map((p) => [p.role, p.id])) as Record<"partner_a" | "partner_b" | "chef", string>;
  return { bookingId: b.bookingId, catererId, adminId, a: byRole.partner_a, b: byRole.partner_b, chef: byRole.chef, invites: b.invites };
}

export async function consent(personId: string, bookingId: string, relationshipStartDate: string | null = COUPLE.relationshipStart) {
  const ctx = await loadConsentContext(personId);
  return grantConsent({ personId, bookingId, text: ctx!.text, ip: "127.0.0.1", relationshipStartDate });
}

export async function uploadFixture(personId: string, bookingId: string, file: string) {
  const src = path.resolve("fixtures", "exports", file);
  if (!fs.existsSync(src)) throw new Error(`missing fixture ${file}; run npm run fixtures`);
  const tmp = path.join(process.env.STORAGE_DIR!, "tus", `${newId()}.zip`);
  await fsp.mkdir(path.dirname(tmp), { recursive: true });
  await fsp.copyFile(src, tmp);
  return registerUpload({ personId, bookingId, srcPath: tmp, originalName: file });
}

export async function runPipeline() {
  await runUntilIdle();
}

/** The full demo: both partners consent and upload, pipeline runs to completion. */
export async function demoBooking() {
  const bk = await freshBooking();
  await consent(bk.a, bk.bookingId);
  await consent(bk.b, bk.bookingId);
  const ua = await uploadFixture(bk.a, bk.bookingId, "aino_instagram.zip");
  const ub = await uploadFixture(bk.b, bk.bookingId, "sam_google_takeout.zip");
  await runPipeline();
  return { ...bk, uploads: { a: ua.id, b: ub.id } };
}

export function manifestOracle(): { id: string; owner: string; file: string; is_food: boolean; dish: string | null; beat: string | null }[] {
  return JSON.parse(fs.readFileSync(path.resolve("fixtures", "manifest.json"), "utf8")).images;
}
