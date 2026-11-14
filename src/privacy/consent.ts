import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { consents, people, bookings } from "@/db/schema";
import { newId, nowIso, sha256 } from "@/lib/ids";
import { audit } from "@/lib/audit";

/**
 * The consent text (US-1 AC1). Its sha256 is stored with every consent (AC2), so any
 * wording change produces a new version and old consents stay attributable.
 */
export function consentSections(input: { coupleName: string; weddingDate: string; catererName: string }) {
  return [
    {
      heading: "What we collect",
      body: [
        "Only files you upload yourself: your Instagram, Facebook and Google Photos data exports.",
        "From them we read photos, captions, post text, dates and the places tagged in them. Videos are skipped.",
        "We never log in to any of your accounts and never scrape private pages.",
      ],
    },
    {
      heading: "Why",
      body: [
        `For one purpose only: designing the menu for ${input.coupleName}'s wedding on ${input.weddingDate}, catered by ${input.catererName}.`,
        "Nothing is used for advertising, profiling or any other event.",
      ],
    },
    {
      heading: "How it is processed",
      body: [
        "An AI model (Anthropic's Claude) looks at each photo once to find food and drink, and reads captions for food and life events. It never identifies people.",
        "For restaurants you visited, Context.dev reads the restaurant's public website to find its menu. Only public web addresses are sent to Context.dev — never your photos, names or locations.",
        "Faces are blurred in any image the chef sees. Comments written by other people are never shown to anyone.",
      ],
    },
    {
      heading: "Who sees what",
      body: [
        "You see your own memories first and decide what to share. Your partner does not see your unapproved memories.",
        "The chef sees only memories you approve: the dish, the date, the place, your note and a face-blurred photo of the food.",
        `The caterer (${input.catererName}) sees progress counts only, never your photos or memories.`,
      ],
    },
    {
      heading: "How long we keep it",
      body: [
        "Your uploaded export files are deleted as soon as processing finishes, and never later than 24 hours after upload. Full-size photos are never stored; we keep only a cropped image of the food.",
        `Everything else is deleted automatically 30 days after the wedding date.`,
      ],
    },
    {
      heading: "Your rights",
      body: [
        "You can withdraw consent at any time from this page. Your uploads, memories and every link to them are deleted within 5 minutes.",
        "Your partner's consent is separate: withdrawing yours does not delete theirs.",
        `${input.catererName} is the data controller and Wedding Food Memory processes data on their behalf. Data is hosted in the EU.`,
      ],
    },
  ];
}

export function consentText(input: { coupleName: string; weddingDate: string; catererName: string }): string {
  return consentSections(input)
    .map((s) => `## ${s.heading}\n${s.body.map((b) => `- ${b}`).join("\n")}`)
    .join("\n\n");
}

export function consentVersion(text: string): string {
  return sha256(text);
}

export async function activeConsent(personId: string) {
  const rows = await getDb()
    .select()
    .from(consents)
    .where(and(eq(consents.personId, personId), isNull(consents.withdrawnAt)))
    .orderBy(desc(consents.grantedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** P1: no processing of a person's data before a live (not withdrawn) consent row exists. */
export async function hasActiveConsent(personId: string): Promise<boolean> {
  return (await activeConsent(personId)) !== null;
}

export async function grantConsent(input: {
  personId: string;
  bookingId: string;
  text: string;
  ip: string;
  relationshipStartDate?: string | null;
}) {
  const existing = await activeConsent(input.personId);
  if (existing) return existing;
  const { resumePerson } = await import("@/pipeline/runner");
  const row = {
    id: newId(),
    personId: input.personId,
    consentTextVersion: consentVersion(input.text),
    grantedAt: nowIso(),
    withdrawnAt: null,
    ip: input.ip,
    relationshipStartDate: input.relationshipStartDate ?? null,
  };
  await getDb().insert(consents).values(row);
  // The first consent moves the booking into "collecting".
  await getDb()
    .update(bookings)
    .set({ status: "collecting", updatedAt: nowIso() })
    .where(and(eq(bookings.id, input.bookingId), eq(bookings.status, "invited")));
  await audit({
    actor: input.personId,
    action: "consent.granted",
    bookingId: input.bookingId,
    targetType: "consent",
    targetId: row.id,
    detail: { version: row.consentTextVersion },
  });
  await resumePerson(input.personId);
  return row;
}

export async function loadConsentContext(personId: string) {
  const db = getDb();
  const person = (await db.select().from(people).where(eq(people.id, personId)))[0];
  if (!person?.bookingId) return null;
  const booking = (await db.select().from(bookings).where(eq(bookings.id, person.bookingId)))[0];
  if (!booking) return null;
  const { caterers } = await import("@/db/schema");
  const caterer = (await db.select().from(caterers).where(eq(caterers.id, booking.catererId)))[0];
  const ctx = {
    coupleName: booking.coupleDisplayName,
    weddingDate: booking.weddingDate,
    catererName: caterer?.name ?? "your caterer",
  };
  const text = consentText(ctx);
  return { person, booking, ctx, text, version: consentVersion(text), sections: consentSections(ctx) };
}
