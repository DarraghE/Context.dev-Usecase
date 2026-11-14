/**
 * Builds the synthetic demo dataset (§12) and seeds the demo caterer.
 *
 *   npm run fixtures          → fixture exports + replay files only
 *   npm run seed              → also migrate the DB and print a caterer sign-in link
 *   npm run seed -- --booking → also create the Aino & Sam booking and print every invite link
 */
import { config as loadEnv } from "dotenv";
loadEnv({ quiet: true });

const args = new Set(process.argv.slice(2));
const { buildFixtures } = await import("./fixtures/build");

const t0 = Date.now();
const { images, food } = await buildFixtures();
console.log(`fixtures: ${images} images (${food} food) → fixtures/exports/*.zip, replays → fixtures/replay/claude/*.json (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

if (!args.has("--fixtures-only")) {
  const { ensureMigrated } = await import("../src/db/client");
  const { DEMO_CATERER, createBooking, ensureCaterer, ensureCatererAdmin, issueInvite } = await import("../src/lib/bookings");
  const { COUPLE } = await import("./fixtures/manifest");
  await ensureMigrated();
  const catererId = await ensureCaterer(DEMO_CATERER.name);
  const adminId = await ensureCatererAdmin(catererId, DEMO_CATERER.adminEmail, DEMO_CATERER.adminName);
  console.log(`\ncaterer sign-in link (single use, 7 days):\n  ${await issueInvite(adminId)}`);
  if (args.has("--booking")) {
    const b = await createBooking(
      {
        coupleDisplayName: COUPLE.name,
        weddingDate: COUPLE.weddingDate,
        partnerA: COUPLE.partnerA,
        partnerB: COUPLE.partnerB,
        chef: COUPLE.chef,
        dietary: { allergies: COUPLE.dietary.allergies, diets: COUPLE.dietary.diets, notes: COUPLE.dietary.notes },
        defaultTz: "Europe/Helsinki",
      },
      catererId,
      adminId,
    );
    console.log(`\nbooking ${b.bookingId}`);
    for (const [role, inv] of Object.entries(b.invites)) console.log(`  ${role.padEnd(10)} ${inv.name.padEnd(20)} ${inv.url}`);
  }
  console.log("\nOr open the home page and use “Open the caterer demo”.");
}
process.exit(0);
