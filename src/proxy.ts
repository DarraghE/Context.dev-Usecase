import { NextResponse, type NextRequest } from "next/server";
import { checkAccess, homeFor } from "@/privacy/guards";
import { SESSION_COOKIE, verifySession } from "@/privacy/session";

/**
 * Runs before every page and API route. All role checks happen here, via
 * src/privacy/guards.ts (§8). Route handlers then scope data to the session.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  const result = checkAccess(pathname, session);

  if (result.ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }
  // Pages: send signed-in users to their own home, others to the landing page.
  const target = request.nextUrl.clone();
  target.search = "";
  target.pathname = session ? homeFor(session.role) : "/";
  if (!session) target.searchParams.set("signin", "required");
  return NextResponse.redirect(target);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
