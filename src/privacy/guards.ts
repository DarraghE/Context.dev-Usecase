import type { Role, Session } from "./session";

/**
 * The single place where route → role access is decided (§8). `src/proxy.ts` runs this
 * for every request before any page or route handler executes. Handlers never re-decide
 * roles; they only scope their queries to the session's own person / booking.
 *
 * Unknown API routes are denied by default.
 */
type Access = Role[] | "public" | "any_session";

const PARTNERS: Role[] = ["partner_a", "partner_b"];
const ALL_ROLES: Role[] = ["partner_a", "partner_b", "chef", "caterer_admin"];

export const ROUTE_RULES: { pattern: RegExp; access: Access; note: string }[] = [
  // Public
  { pattern: /^\/$/, access: "public", note: "landing" },
  { pattern: /^\/invite\/[^/]+$/, access: "public", note: "magic link landing" },
  { pattern: /^\/privacy$/, access: "public", note: "privacy notice" },
  { pattern: /^\/api\/invites\/[^/]+\/exchange$/, access: "public", note: "magic link → session" },
  { pattern: /^\/api\/auth\/logout$/, access: "public", note: "clear cookie" },
  { pattern: /^\/api\/demo\/caterer-link$/, access: "public", note: "demo-only, 404 unless DEMO_MODE=1" },
  { pattern: /^\/api\/health$/, access: "public", note: "liveness" },

  // Caterer
  { pattern: /^\/api\/bookings$/, access: ["caterer_admin"], note: "create/list bookings" },
  { pattern: /^\/api\/bookings\/[^/]+\/delete$/, access: ["caterer_admin"], note: "delete everything now" },
  { pattern: /^\/api\/bookings\/[^/]+\/invites$/, access: ["caterer_admin"], note: "re-issue invite links" },
  { pattern: /^\/api\/bookings\/[^/]+\/status$/, access: ALL_ROLES, note: "progress counts only" },
  { pattern: /^\/caterer(\/.*)?$/, access: ["caterer_admin"], note: "caterer pages" },

  // Partner
  { pattern: /^\/api\/consent(\/withdraw)?$/, access: PARTNERS, note: "consent" },
  { pattern: /^\/api\/uploads(\/.*)?$/, access: PARTNERS, note: "tus uploads + list (consent checked in handler)" },
  { pattern: /^\/api\/review\/memories(\/[^/]+)?$/, access: PARTNERS, note: "own memories only" },
  { pattern: /^\/partner(\/.*)?$/, access: PARTNERS, note: "partner pages" },

  // Chef
  { pattern: /^\/api\/chef\/.*$/, access: ["chef"], note: "approved memories, menus" },
  { pattern: /^\/chef(\/.*)?$/, access: ["chef"], note: "chef pages" },

  // Media: signed URL + per-key ACL checked in the handler (P11)
  { pattern: /^\/api\/media\/.+$/, access: "any_session", note: "signed media" },
];

export type GuardResult = { ok: true; rule: string } | { ok: false; status: 401 | 403 | 404; reason: string };

export function checkAccess(pathname: string, session: Session | null): GuardResult {
  const rule = ROUTE_RULES.find((r) => r.pattern.test(pathname));
  if (!rule) {
    // Deny unknown API routes; let unknown pages fall through to Next's 404.
    if (pathname.startsWith("/api/")) return { ok: false, status: 404, reason: "unknown route" };
    return { ok: true, rule: "unmatched-page" };
  }
  if (rule.access === "public") return { ok: true, rule: rule.note };
  if (!session) return { ok: false, status: 401, reason: "sign-in required" };
  if (rule.access === "any_session") return { ok: true, rule: rule.note };
  if (!rule.access.includes(session.role)) return { ok: false, status: 403, reason: `role ${session.role} not allowed` };
  return { ok: true, rule: rule.note };
}

/** Where each role lands after signing in. */
export function homeFor(role: Role): string {
  switch (role) {
    case "caterer_admin":
      return "/caterer";
    case "chef":
      return "/chef";
    default:
      return "/partner";
  }
}
