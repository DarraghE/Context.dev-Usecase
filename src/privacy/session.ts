import { SignJWT, jwtVerify } from "jose";
import { config } from "@/config";

export type Role = "partner_a" | "partner_b" | "chef" | "caterer_admin";
export const PARTNER_ROLES: Role[] = ["partner_a", "partner_b"];

export type Session = {
  personId: string;
  role: Role;
  bookingId: string | null;
  catererId: string | null;
};

export const SESSION_COOKIE = "wfm_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const key = () => new TextEncoder().encode(config.sessionSecret);

/** Magic-link invite: single-use signed token (JWT, HS256, 7-day expiry) (§3). */
export async function signInviteToken(input: { jti: string; personId: string; role: Role; expiresAt: Date }): Promise<string> {
  return new SignJWT({ typ: "invite", role: input.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.personId)
    .setJti(input.jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(input.expiresAt.getTime() / 1000))
    .sign(key());
}

export async function verifyInviteToken(token: string): Promise<{ jti: string; personId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (payload.typ !== "invite" || !payload.sub || !payload.jti) return null;
    return { jti: payload.jti, personId: payload.sub };
  } catch {
    return null;
  }
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ typ: "session", role: s.role, bid: s.bookingId, cid: s.catererId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.personId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (payload.typ !== "session" || !payload.sub) return null;
    const role = payload.role as Role;
    if (!["partner_a", "partner_b", "chef", "caterer_admin"].includes(role)) return null;
    return {
      personId: payload.sub,
      role,
      bookingId: (payload.bid as string | null) ?? null,
      catererId: (payload.cid as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};

export const isPartner = (r: Role) => r === "partner_a" || r === "partner_b";
