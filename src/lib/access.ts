import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bookings } from "@/db/schema";
import type { Session } from "@/privacy/session";
import { HttpError } from "./http";

/**
 * Object-level scope (not role checks — those live in src/privacy/guards.ts):
 * a session may only touch its own booking, or, for a caterer, its caterer's bookings.
 */
export async function assertBookingScope(s: Session, bookingId: string) {
  const b = (await getDb().select().from(bookings).where(eq(bookings.id, bookingId)))[0];
  if (!b) throw new HttpError(404, "booking not found");
  if (s.role === "caterer_admin") {
    if (b.catererId !== s.catererId) throw new HttpError(404, "booking not found");
  } else if (s.bookingId !== bookingId) {
    throw new HttpError(404, "booking not found");
  }
  return b;
}

export function requireBooking(s: Session): string {
  if (!s.bookingId) throw new HttpError(403, "no booking on this session");
  return s.bookingId;
}
