import { NextResponse } from "next/server";
import { requireBooking } from "@/lib/access";
import { handler, requireSession } from "@/lib/http";
import { chefList } from "@/lib/memories";

/** GET /api/chef/memories?view=timeline|ranked — approved memories only, blurred images (P5, P6). */
export const GET = handler(async (req: Request) => {
  const s = await requireSession();
  const bookingId = requireBooking(s);
  const view = new URL(req.url).searchParams.get("view") === "ranked" ? "ranked" : "timeline";
  return NextResponse.json({ view, memories: await chefList(bookingId, s.personId, view) });
});
