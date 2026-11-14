import { NextResponse } from "next/server";
import { config } from "@/config";
import { DEMO_CATERER, ensureCaterer, ensureCatererAdmin, issueInvite } from "@/lib/bookings";
import { handler } from "@/lib/http";

/**
 * Demo-only: a fresh caterer sign-in link, so judges can start the demo script from the home
 * page. Returns 404 unless DEMO_MODE=1. Production caterers are onboarded by email.
 */
export const POST = handler(async () => {
  if (!config.demoMode) return NextResponse.json({ error: "not found" }, { status: 404 });
  const catererId = await ensureCaterer(DEMO_CATERER.name);
  const adminId = await ensureCatererAdmin(catererId, DEMO_CATERER.adminEmail, DEMO_CATERER.adminName);
  const url = await issueInvite(adminId);
  return NextResponse.json({ url, path: new URL(url).pathname });
});
