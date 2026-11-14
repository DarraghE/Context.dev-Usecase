/**
 * Re-records every replay fixture from the LIVE APIs (Claude + Context.dev): runs the demo
 * dataset through the pipeline, approves all memories, drafts a menu. Needs both API keys.
 *   npm run replay:record
 * Then review the diff in fixtures/replay/ and run `npm test`. Menu recordings cite memories
 * by dish key, so they replay against any run.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ quiet: true });

const { liveRun } = await import("./live-run");
const r = await liveRun({ record: true, menu: true });
console.log(`recorded: ${r.photos.length} photos processed in ${(r.elapsedMs / 1000).toFixed(0)} s → fixtures/replay/`);
process.exit(0);
