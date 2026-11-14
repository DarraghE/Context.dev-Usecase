import path from "node:path";

/**
 * Single source of runtime configuration. Model choice per stage lives here (§9.1):
 * the default is claude-opus-5-5 everywhere; MODEL_* env vars override per stage.
 * Changing a model is a cost decision for the team: log it in docs/decisions.md.
 */
export const DEFAULT_MODEL = "claude-opus-5-5";

type Effort = "low" | "medium" | "high";

function env(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function envInt(name: string, fallback: number): number {
  const v = Number.parseInt(env(name), 10);
  return Number.isFinite(v) ? v : fallback;
}

export const config = {
  get appBaseUrl() {
    return env("APP_BASE_URL", "http://localhost:3000");
  },
  get sessionSecret() {
    const s = env("SESSION_SECRET");
    if (!s || s.length < 32) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("SESSION_SECRET must be set to at least 32 characters in production");
      }
      return "dev-only-insecure-session-secret-change-me-0000";
    }
    return s;
  },
  get databaseUrl() {
    return env("DATABASE_URL", "file:./data/app.db");
  },
  get storageDir() {
    return path.resolve(env("STORAGE_DIR", "./storage"));
  },
  /** Replay recorded Claude and Context.dev responses instead of calling the APIs. */
  get demoReplay() {
    return env("DEMO_REPLAY", "0") === "1";
  },
  /** Save live responses as replay recordings. */
  get record() {
    return env("RECORD", "0") === "1";
  },
  /** Show demo shortcuts in the UI. */
  get demoMode() {
    return env("DEMO_MODE", "1") === "1";
  },
  get anthropicApiKey() {
    return env("ANTHROPIC_API_KEY");
  },
  get contextDevApiKey() {
    return env("CONTEXT_DEV_API_KEY");
  },
  models: {
    get foodDetect() {
      return env("MODEL_FOOD_DETECT", DEFAULT_MODEL);
    },
    get textExtract() {
      return env("MODEL_TEXT_EXTRACT", DEFAULT_MODEL);
    },
    get placeResolve() {
      return env("MODEL_PLACE_RESOLVE", DEFAULT_MODEL);
    },
    get dishMatch() {
      return env("MODEL_DISH_MATCH", DEFAULT_MODEL);
    },
    get menu() {
      return env("MODEL_MENU", DEFAULT_MODEL);
    },
  },
  /** §9.1: low for detection and extraction, medium for place resolution, high for menus. */
  effort: {
    foodDetect: "low" as Effort,
    textExtract: "low" as Effort,
    placeResolve: "medium" as Effort,
    dishMatch: "low" as Effort,
    menu: "high" as Effort,
  },
  detect: {
    get batchThreshold() {
      return envInt("DETECT_BATCH_THRESHOLD", 200);
    },
    get imagesPerRequest() {
      return Math.min(8, Math.max(1, envInt("DETECT_IMAGES_PER_REQUEST", 1)));
    },
    get concurrency() {
      return envInt("DETECT_CONCURRENCY", 6);
    },
    minEdgePx: 200,
    maxLongEdgePx: 1568,
    jpegQuality: 85,
    foodConfidence: 0.6,
    cropMargin: 0.1,
  },
  text: { batchSize: 50 },
  moments: { clusterKm: 3 },
  places: { minConfidence: 0.7 },
  contextDev: {
    baseURL: "https://api.context.dev/v1",
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
    maxCandidates: 3,
    /** Stop scraping further candidate pages once one yields this many items. */
    enoughItems: 5,
    get batchThreshold() {
      return envInt("CONTEXT_DEV_BATCH_THRESHOLD", 12);
    },
    concurrency: 3,
    timeoutMs: 120_000,
  },
  matching: { minConfidence: 0.7 },
  retention: {
    daysAfterWedding: 30,
    rawZipMaxHours: 24,
    withdrawalSlaMinutes: 5,
  },
  media: { urlTtlSeconds: 5 * 60 },
  invites: { ttlDays: 7 },
  upload: { maxBytes: 5 * 1024 * 1024 * 1024 },
};

export const SUPPORTED_PLATFORMS = ["Instagram", "Facebook", "Google Photos (Google Takeout)"] as const;
