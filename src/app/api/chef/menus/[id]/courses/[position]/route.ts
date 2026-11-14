import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBooking } from "@/lib/access";
import { handler, requireSession } from "@/lib/http";
import { regenerateCourse } from "@/menu/generate";

export const maxDuration = 300;

/** POST /api/chef/menus/:id/courses/:position — regenerate one course into a new version. */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string; position: string }> }) => {
  const s = await requireSession();
  const bookingId = requireBooking(s);
  const { id, position } = await ctx.params;
  const body = z.object({ instruction: z.string().max(500).nullish() }).parse(await req.json().catch(() => ({})));
  const row = await regenerateCourse(bookingId, id, Number(position), body.instruction ?? null, s.personId);
  return NextResponse.json({ menu: row });
});
