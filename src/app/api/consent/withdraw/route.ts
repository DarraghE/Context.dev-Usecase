import { NextResponse } from "next/server";
import { handler, requireSession } from "@/lib/http";
import { withdrawConsent } from "@/privacy/deletion";

/** POST /api/consent/withdraw — withdraw and delete this partner's data now (US-1 AC4). */
export const POST = handler(async () => {
  const s = await requireSession();
  const counts = await withdrawConsent(s.personId);
  return NextResponse.json({ withdrawn: true, deleted: counts });
});
