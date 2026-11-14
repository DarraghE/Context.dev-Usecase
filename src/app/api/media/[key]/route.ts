import { NextResponse } from "next/server";
import { handler, requireSession } from "@/lib/http";
import { verifyMediaRequest } from "@/privacy/media";
import { storage } from "@/storage";

/**
 * GET /api/media/:key — signed, 5-minute URLs bound to the viewer's role (P11).
 * Chef URLs resolve only to blurred derivatives; partner URLs only to their own crops.
 */
export const GET = handler(async (req: Request, ctx: { params: Promise<{ key: string }> }) => {
  const s = await requireSession();
  const { key } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const check = verifyMediaRequest({ encodedKey: key, scope: q.get("s"), exp: q.get("e"), sig: q.get("sig") }, s);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: check.status });
  const data = await storage.get(check.key);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=240", "X-Content-Type-Options": "nosniff" },
  });
});
