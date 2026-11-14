import { NextResponse } from "next/server";
import { assertBookingScope } from "@/lib/access";
import { handler, requireSession } from "@/lib/http";
import { bookingStatus } from "@/pipeline/status";
import { isPartner } from "@/privacy/session";

/** GET /api/bookings/:id/status — stage progress counts only (caterer, partners, chef). */
export const GET = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireSession();
  const { id } = await ctx.params;
  await assertBookingScope(s, id);
  const mine = new URL(req.url).searchParams.get("scope") === "me" && isPartner(s.role);
  const status = await bookingStatus(id, mine ? { personId: s.personId } : {});
  return NextResponse.json(status);
});
