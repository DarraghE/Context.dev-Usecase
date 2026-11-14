import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { config } from "@/config";
import { getDb } from "@/db/client";
import { bookings, caterers, invites, people } from "@/db/schema";
import { signInviteToken, verifyInviteToken, type Role, type Session } from "@/privacy/session";
import { audit } from "./audit";
import { addDays, newId, nowIso } from "./ids";

export const NewBookingZ = z.object({
  coupleDisplayName: z.string().trim().min(1).max(120),
  weddingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partnerA: z.object({ name: z.string().trim().min(1).max(80), email: z.email() }),
  partnerB: z.object({ name: z.string().trim().min(1).max(80), email: z.email() }),
  chef: z.object({ name: z.string().trim().min(1).max(80), email: z.email() }),
  dietary: z.object({
    allergies: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    diets: z.record(z.string(), z.number().int().min(0).max(5000)).default({}),
    notes: z.string().max(1000).default(""),
  }),
  defaultTz: z.string().default("Europe/Helsinki"),
});
export type NewBooking = z.infer<typeof NewBookingZ>;

export async function ensureCaterer(name: string): Promise<string> {
  const db = getDb();
  const existing = (await db.select().from(caterers).where(eq(caterers.name, name)))[0];
  if (existing) return existing.id;
  const id = newId();
  await db.insert(caterers).values({ id, name, createdAt: nowIso() });
  return id;
}

export async function ensureCatererAdmin(catererId: string, email: string, displayName: string): Promise<string> {
  const db = getDb();
  const existing = (await db.select().from(people).where(and(eq(people.catererId, catererId), eq(people.role, "caterer_admin"), eq(people.email, email))))[0];
  if (existing) return existing.id;
  const id = newId();
  await db.insert(people).values({ id, bookingId: null, catererId, role: "caterer_admin", email, displayName, createdAt: nowIso() });
  return id;
}

/** Issues a single-use magic link (JWT HS256, 7-day expiry). The MVP shows it on screen. */
export async function issueInvite(personId: string, actor = "system"): Promise<string> {
  const db = getDb();
  const person = (await db.select().from(people).where(eq(people.id, personId)))[0];
  if (!person) throw new Error("person not found");
  const jti = newId();
  const expiresAt = new Date(Date.now() + config.invites.ttlDays * 86_400_000);
  await db.insert(invites).values({ id: jti, personId, expiresAt: expiresAt.toISOString(), usedAt: null, createdAt: nowIso() });
  const token = await signInviteToken({ jti, personId, role: person.role as Role, expiresAt });
  await audit({ actor, action: "invite.created", bookingId: person.bookingId, targetType: "person", targetId: personId, detail: { role: person.role } });
  return `${config.appBaseUrl}/invite/${token}`;
}

export async function createBooking(input: NewBooking, catererId: string, actor: string) {
  const db = getDb();
  const id = newId();
  const now = nowIso();
  await db.insert(bookings).values({
    id,
    catererId,
    weddingDate: input.weddingDate,
    coupleDisplayName: input.coupleDisplayName,
    dietaryConstraints: input.dietary,
    status: "invited",
    deleteAfter: addDays(input.weddingDate, config.retention.daysAfterWedding),
    defaultTz: input.defaultTz,
    addonPriceEur: null,
    createdAt: now,
    updatedAt: now,
  });
  const mk = async (role: Role, p: { name: string; email: string }) => {
    const pid = newId();
    await db.insert(people).values({ id: pid, bookingId: id, catererId: null, role, email: p.email.toLowerCase(), displayName: p.name, createdAt: now });
    return pid;
  };
  const a = await mk("partner_a", input.partnerA);
  const b = await mk("partner_b", input.partnerB);
  const c = await mk("chef", input.chef);
  await audit({ actor, action: "booking.created", bookingId: id, targetType: "booking", targetId: id });
  return {
    bookingId: id,
    invites: {
      partner_a: { name: input.partnerA.name, url: await issueInvite(a, actor) },
      partner_b: { name: input.partnerB.name, url: await issueInvite(b, actor) },
      chef: { name: input.chef.name, url: await issueInvite(c, actor) },
    },
  };
}

/** Exchanges a magic link for a session. Single use: a second exchange fails. */
export async function exchangeInvite(token: string): Promise<Session | null> {
  const v = await verifyInviteToken(token);
  if (!v) return null;
  const db = getDb();
  const used = await db
    .update(invites)
    .set({ usedAt: nowIso() })
    .where(and(eq(invites.id, v.jti), eq(invites.personId, v.personId), isNull(invites.usedAt)))
    .returning();
  if (!used.length) return null;
  if (Date.parse(used[0]!.expiresAt) < Date.now()) return null;
  const person = (await db.select().from(people).where(eq(people.id, v.personId)))[0];
  if (!person) return null;
  if (person.bookingId) {
    const b = (await db.select().from(bookings).where(eq(bookings.id, person.bookingId)))[0];
    if (!b || b.status === "deleted") return null;
  }
  await audit({ actor: person.id, action: "invite.exchanged", bookingId: person.bookingId, targetType: "invite", targetId: v.jti });
  return { personId: person.id, role: person.role as Role, bookingId: person.bookingId, catererId: person.catererId };
}

export const DEMO_CATERER = { name: "Juhla Catering Oy", adminEmail: "events@juhla-catering.example", adminName: "Mira (Juhla Catering)" };
