/**
 * §13 food-detection check, LIVE: recall ≥ 90% on food photos, false positives ≤ 5% on the rest,
 * plus AC4 timing extrapolated to 1,000 photos. Needs ANTHROPIC_API_KEY. Costs real money.
 *   npm run test:accuracy              (measure only)
 *   RECORD=1 npm run test:accuracy     (also lock the responses into fixtures/replay/)
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ quiet: true });

const { liveRun } = await import("./live-run");
const { photos, elapsedMs } = await liveRun({ record: process.env.RECORD === "1", menu: false });
const oracle = new Map<string, boolean>(JSON.parse(fs.readFileSync(path.resolve("fixtures", "manifest.json"), "utf8")).images.map((o: { file: string; is_food: boolean }) => [o.file, o.is_food]));

let tp = 0, fn = 0, fp = 0, tn = 0;
const misses: string[] = [];
for (const p of photos) {
  const truth = oracle.get(path.posix.basename(p.sourcePath));
  if (truth === undefined) continue;
  if (truth && p.isFood) tp++;
  else if (truth) (fn++, misses.push(`missed: ${p.sourcePath}`));
  else if (p.isFood) (fp++, misses.push(`false positive: ${p.sourcePath}`));
  else tn++;
}
const recall = tp / Math.max(1, tp + fn);
const fpr = fp / Math.max(1, fp + tn);
const per1000 = (elapsedMs / Math.max(1, photos.length)) * 1000;
console.log(`photos ${photos.length} · recall ${(recall * 100).toFixed(1)}% (≥90) · false positives ${(fpr * 100).toFixed(1)}% (≤5)`);
console.log(`elapsed ${(elapsedMs / 1000).toFixed(0)} s → ~${(per1000 / 60_000).toFixed(1)} min per 1,000 photos (AC4: < 30)`);
for (const m of misses) console.log("  " + m);
process.exit(recall >= 0.9 && fpr <= 0.05 ? 0 : 1);
