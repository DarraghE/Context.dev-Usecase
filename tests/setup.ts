import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Every test file gets its own database and storage directory, and runs in replay mode
 * (no network, no cost). LIVE=1 switches the Context.dev smoke test to the real API.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wfm-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db").replace(/\\/g, "/")}`;
process.env.STORAGE_DIR = path.join(dir, "storage");
process.env.DEMO_REPLAY = process.env.LIVE === "1" ? "0" : "1";
process.env.DEMO_MODE = "1";
process.env.RECORD = "0";
process.env.SESSION_SECRET = "test-secret-that-is-long-enough-for-hs256-signing";
process.env.APP_BASE_URL = "http://localhost:3000";
