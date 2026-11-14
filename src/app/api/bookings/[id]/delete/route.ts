import { NextResponse } from "next/server";
import { z } from "zod";
import { assertBookingScope } from "@/lib/access";
import { handler, HttpError, requireSession } from "@/lib/http";
import { deleteBooking } from "@/privacy/deletion";

/** POST /api/bookings/:id/delete — caterer deletes everything now (behind a typed confirmation). */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireSession();
  const { id } = await ctx.params;
  const b = await assertBookingScope(s, id);
  const { confirm } = z.object({ confirm: z.string() }).parse(await req.json());
  if (confirm !== "DELETE") throw new HttpError(400, 'type "DELETE" to confirm');
  if (b.status === "deleted") return NextResponse.json({ deleted: true, counts: {} });
  const counts = await deleteBooking(id, s.personId);
  return NextResponse.json({ deleted: true, counts });
});
