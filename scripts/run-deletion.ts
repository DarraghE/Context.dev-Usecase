/**
 * P9 deletion job, run on demand (the app also runs it daily in-process):
 * deletes every booking past `delete_after` and sweeps raw zips older than 24 h.
 *   npm run deletion:run
 */
import { config as loadEnv } from "dotenv";
loadEnv({ quiet: true });

const { ensureMigrated } = await import("../src/db/client");
const { runDailyDeletion } = await import("../src/privacy/deletion");
await ensureMigrated();
const r = await runDailyDeletion();
console.log(`deletion job: ${r.bookings} booking(s) deleted, ${r.raw} raw zip(s) swept (logged in audit_log)`);
process.exit(0);
