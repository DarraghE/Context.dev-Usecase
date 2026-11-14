import fs from "node:fs";
import path from "node:path";

/** Builds the synthetic fixture exports once if they are missing. */
export default async function setup() {
  const zip = path.resolve("fixtures", "exports", "aino_instagram.zip");
  if (!fs.existsSync(zip)) {
    const { buildFixtures } = await import("../scripts/fixtures/build");
    await buildFixtures();
  }
}
