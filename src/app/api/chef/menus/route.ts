import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { menus } from "@/db/schema";
import { requireBooking } from "@/lib/access";
import { handler, HttpError, requireSession } from "@/lib/http";
import { generateMenu } from "@/menu/generate";

export const maxDuration = 300;

/** GET /api/chef/menus — every saved version, newest first. */
export const GET = handler(async () => {
  const s = await requireSession();
  const bookingId = requireBooking(s);
  const rows = await getDb().select().from(menus).where(eq(menus.bookingId, bookingId)).orderBy(desc(menus.version));
  return NextResponse.json({ menus: rows });
});

/** POST /api/chef/menus — generate a five-course draft from approved memories (US-7 AC4). */
export const POST = handler(async () => {
  const s = await requireSession();
  const bookingId = requireBooking(s);
  try {
    const row = await generateMenu(bookingId, s.personId);
    return NextResponse.json({ menu: row }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("No approved memories")) throw new HttpError(409, e.message);
    throw e;
  }
});
