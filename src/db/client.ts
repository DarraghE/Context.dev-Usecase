import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { config } from "@/config";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

type Holder = { client: Client; db: DB; url: string; migrated?: Promise<void> };
const g = globalThis as unknown as { __wfmDb?: Holder };

function ensureDir(url: string) {
  if (url.startsWith("file:")) {
    const file = url.slice("file:".length);
    if (file && file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
}

/** Process-wide database handle (survives Next.js dev hot reloads). */
export function getDb(): DB {
  const url = config.databaseUrl;
  if (!g.__wfmDb || g.__wfmDb.url !== url) {
    ensureDir(url);
    const client = createClient({ url });
    const db = drizzle(client, { schema });
    g.__wfmDb = { client, db, url };
  }
  return g.__wfmDb.db;
}

export function getClient(): Client {
  getDb();
  return g.__wfmDb!.client;
}

/** Applies pending migrations once per process. */
export async function ensureMigrated(): Promise<void> {
  getDb();
  const holder = g.__wfmDb!;
  if (!holder.migrated) {
    holder.migrated = (async () => {
      await holder.client.execute("PRAGMA foreign_keys = ON");
      if (holder.url.startsWith("file:")) await holder.client.execute("PRAGMA journal_mode = WAL");
      await migrate(holder.db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    })();
  }
  return holder.migrated;
}

/** Test helper: drop the cached handle so a new DATABASE_URL takes effect. */
export function resetDbForTests() {
  if (g.__wfmDb) {
    g.__wfmDb.client.close();
    g.__wfmDb = undefined;
  }
}

export { schema };
