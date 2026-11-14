import { NextResponse } from "next/server";
import { exchangeInvite } from "@/lib/bookings";
import { handler } from "@/lib/http";
import { homeFor } from "@/privacy/guards";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/privacy/session";

/** POST /api/invites/:token/exchange — single-use magic link → httpOnly session cookie (§3). */
export const POST = handler(async (_req: Request, ctx: { params: Promise<{ token: string }> }) => {
  const { token } = await ctx.params;
  const session = await exchangeInvite(token);
  if (!session) {
    return NextResponse.json({ error: "This link has expired or was already used. Ask your caterer for a new one." }, { status: 410 });
  }
  const res = NextResponse.json({ ok: true, role: session.role, redirect: homeFor(session.role) });
  res.cookies.set(SESSION_COOKIE, await signSession(session), sessionCookieOptions);
  return res;
});
