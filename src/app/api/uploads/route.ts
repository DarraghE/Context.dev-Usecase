import { NextResponse } from "next/server";
import { ensureMigrated } from "@/db/client";
import { handler, requireSession } from "@/lib/http";
import { tusServer } from "@/lib/tus";
import { listOwnUploads } from "@/lib/uploads";
import { ensureRunner } from "@/pipeline/runner";

export const runtime = "nodejs";

/** GET /api/uploads — the partner's own uploads with stats and skip reasons (US-2 AC4). */
export const GET = handler(async () => {
  const s = await requireSession();
  const rows = await listOwnUploads(s.personId);
  return NextResponse.json({
    uploads: rows.map((u) => ({ id: u.id, platform: u.platform, name: u.originalName, bytes: u.bytes, status: u.status, stats: u.stats, error: u.error, created_at: u.createdAt })),
  });
});

/** tus protocol endpoints (create / resume / offset) — consent is enforced in the tus hooks. */
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
