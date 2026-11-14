import { config as loadEnv } from "dotenv";
loadEnv({ quiet: true });

const { ensureMigrated } = await import("../src/db/client");
await ensureMigrated();
console.log("database migrated:", process.env.DATABASE_URL ?? "file:./data/app.db");
