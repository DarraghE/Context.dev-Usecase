import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBooking } from "@/lib/access";
import { clientIp, handler, HttpError, requireSession } from "@/lib/http";
import { activeConsent, grantConsent, loadConsentContext } from "@/privacy/consent";

/** GET /api/consent — the consent text for this partner, its version hash, and current state. */
export const GET = handler(async () => {
  const s = await requireSession();
  const ctx = await loadConsentContext(s.personId);
  if (!ctx) throw new HttpError(404, "booking not found");
  const current = await activeConsent(s.personId);
  return NextResponse.json({
    sections: ctx.sections,
    version: ctx.version,
    couple: ctx.ctx.coupleName,
    wedding_date: ctx.ctx.weddingDate,
    caterer: ctx.ctx.catererName,
    consented: !!current,
    granted_at: current?.grantedAt ?? null,
    relationship_start_date: current?.relationshipStartDate ?? null,
  });
});

/** POST /api/consent — grant consent; stores timestamp, text version (sha256) and IP (US-1 AC2). */
export const POST = handler(async (req: Request) => {
  const s = await requireSession();
  const bookingId = requireBooking(s);
  const body = z
    .object({
      version: z.string().length(64),
      relationshipStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    })
    .parse(await req.json());
  const ctx = await loadConsentContext(s.personId);
  if (!ctx) throw new HttpError(404, "booking not found");
  if (body.version !== ctx.version) throw new HttpError(409, "The consent text changed. Please reload and read it again.");
  const row = await grantConsent({ personId: s.personId, bookingId, text: ctx.text, ip: clientIp(req), relationshipStartDate: body.relationshipStartDate ?? null });
  return NextResponse.json({ consented: true, granted_at: row.grantedAt, version: row.consentTextVersion });
});
