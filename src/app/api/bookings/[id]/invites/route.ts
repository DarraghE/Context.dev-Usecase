import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { people } from "@/db/schema";
import { assertBookingScope } from "@/lib/access";
import { issueInvite } from "@/lib/bookings";
import { handler, HttpError, requireSession } from "@/lib/http";

/** POST /api/bookings/:id/invites — re-issue fresh single-use links (old ones stay single-use). */
export const POST = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireSession();
  const { id } = await ctx.params;
  const b = await assertBookingScope(s, id);
  if (b.status === "deleted") throw new HttpError(410, "booking deleted");
  const ppl = await getDb().select().from(people).where(eq(people.bookingId, id));
  const invites: Record<string, { name: string; url: string }> = {};
  for (const p of ppl) invites[p.role] = { name: p.displayName, url: await issueInvite(p.id, s.personId) };
  return NextResponse.json({ invites });
});
