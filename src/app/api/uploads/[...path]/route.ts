import { ensureMigrated } from "@/db/client";
import { tusServer } from "@/lib/tus";
import { ensureRunner } from "@/pipeline/runner";

export const runtime = "nodejs";

/** tus upload resources: /api/uploads/<upload-id> (HEAD for offset, PATCH for chunks). */
async function tus(req: Request): Promise<Response> {
  await ensureMigrated();
  ensureRunner();
  return tusServer().handleWeb(req);
}

export const POST = tus;
export const HEAD = tus;
export const PATCH = tus;
export const DELETE = tus;
export const OPTIONS = tus;
export const GET = tus;
