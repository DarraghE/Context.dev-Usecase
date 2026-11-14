import { eq } from "drizzle-orm";
import { ensureMigrated, getDb } from "@/db/client";
import { bookings, caterers, people } from "@/db/schema";
import { ensureRunner } from "@/pipeline/runner";
import { getSession } from "./http";

/** Server-component helper: the signed-in person, their booking and caterer. */
export async function loadViewer() {
  await ensureMigrated();
  ensureRunner();
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const person = (await db.select().from(people).where(eq(people.id, session.personId)))[0];
  if (!person) return null;
  const booking = person.bookingId ? (await db.select().from(bookings).where(eq(bookings.id, person.bookingId)))[0] ?? null : null;
  const catererId = booking?.catererId ?? person.catererId;
  const caterer = catererId ? (await db.select().from(caterers).where(eq(caterers.id, catererId)))[0] ?? null : null;
  return { session, person, booking, caterer };
}

export type Viewer = NonNullable<Awaited<ReturnType<typeof loadViewer>>>;

export const ROLE_LABEL: Record<string, string> = {
  partner_a: "Partner",
  partner_b: "Partner",
  chef: "Chef",
  caterer_admin: "Caterer",
};

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(d);
}
