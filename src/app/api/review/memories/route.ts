import { NextResponse } from "next/server";
import { handler, requireSession } from "@/lib/http";
import { reviewList } from "@/lib/memories";

/** GET /api/review/memories?status= — the partner's own memories only, most significant first. */
export const GET = handler(async (req: Request) => {
  const s = await requireSession();
  const st = new URL(req.url).searchParams.get("status");
  const status = st === "pending" || st === "approved" || st === "hidden" ? st : undefined;
  return NextResponse.json({ memories: await reviewList(s.personId, status) });
});
