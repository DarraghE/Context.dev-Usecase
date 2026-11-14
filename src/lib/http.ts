import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureMigrated } from "@/db/client";
import { SESSION_COOKIE, verifySession, type Session } from "@/privacy/session";
import { ensureRunner } from "@/pipeline/runner";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Reads and verifies the session cookie. Role access was already enforced by proxy.ts. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "sign-in required");
  return s;
}

/** Wraps a route handler: migrations, background runner, uniform JSON errors. */
export function handler<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      await ensureMigrated();
      ensureRunner();
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err && typeof err === "object" && "issues" in err) {
        return NextResponse.json({ error: "invalid request", issues: (err as { issues: unknown }).issues }, { status: 400 });
      }
      console.error("[api] unhandled", err);
      return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
  };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
