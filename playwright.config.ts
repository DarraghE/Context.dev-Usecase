import { defineConfig, devices } from "@playwright/test";

/**
 * E2E: the §12 demo script in DEMO_REPLAY=1 mode against a fresh database and storage dir.
 * The run id keeps each run's data separate (data/ is git-ignored).
 */
const PORT = Number(process.env.E2E_PORT ?? 3200);
const run = process.env.E2E_RUN ?? (process.env.E2E_RUN = String(Date.now()));

export default defineConfig({
  testDir: "e2e",
  timeout: 5 * 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: `file:./data/e2e-${run}/app.db`,
      STORAGE_DIR: `./data/e2e-${run}/storage`,
      DEMO_REPLAY: "1",
      DEMO_MODE: "1",
      RECORD: "0",
      APP_BASE_URL: `http://localhost:${PORT}`,
      SESSION_SECRET: "e2e-session-secret-that-is-long-enough-0123456789",
    },
  },
});
