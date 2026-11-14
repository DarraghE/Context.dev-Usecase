import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { bookings, people } from "@/db/schema";
import { createBooking, NewBookingZ } from "@/lib/bookings";
import { handler, HttpError, requireSession } from "@/lib/http";

/** POST /api/bookings — caterer_admin creates a booking and gets the invite links (§8, §11.1). */
export const POST = handler(async (req: Request) => {
  const s = await requireSession();
  if (!s.catererId) throw new HttpError(403, "not a caterer account");
  const body = NewBookingZ.parse(await req.json());
  const result = await createBooking(body, s.catererId, s.personId);
  return NextResponse.json(result, { status: 201 });
});

/** GET /api/bookings — the caterer's bookings with status only. */
export const GET = handler(async () => {
  const s = await requireSession();
  if (!s.catererId) throw new HttpError(403, "not a caterer account");
  const db = getDb();
  const rows = await db.select().from(bookings).where(eq(bookings.catererId, s.catererId)).orderBy(desc(bookings.createdAt));
  const out = [];
  for (const b of rows) {
    const ppl = b.status === "deleted" ? [] : await db.select({ role: people.role, name: people.displayName }).from(people).where(eq(people.bookingId, b.id));
    out.push({ id: b.id, couple_display_name: b.coupleDisplayName, wedding_date: b.weddingDate, status: b.status, delete_after: b.deleteAfter, people: ppl });
  }
  return NextResponse.json({ bookings: out });
});
