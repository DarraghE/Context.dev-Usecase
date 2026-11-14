import { NextResponse } from "next/server";
import { requireBooking } from "@/lib/access";
import { handler, HttpError, requireSession } from "@/lib/http";
import { chefDetail } from "@/lib/memories";

/** GET /api/chef/memories/:id — one approved memory with the full scraped menu. */
export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireSession();
  const bookingId = requireBooking(s);
  const { id } = await ctx.params;
  const m = await chefDetail(bookingId, s.personId, id);
  if (!m) throw new HttpError(404, "memory not found");
  return NextResponse.json({ memory: m });
});
