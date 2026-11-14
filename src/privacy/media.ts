import crypto from "node:crypto";
import { config } from "@/config";
import type { Role } from "./session";

/**
 * Signed, short-lived media URLs tied to the viewer's role (P11).
 * Partners may only open their own crops; chefs may only open blurred derivatives.
 */
export type MediaScope = "partner" | "chef";

function sign(payload: string): string {
  return crypto.createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}

export function signMediaUrl(key: string, scope: MediaScope, ttlSeconds = config.media.urlTtlSeconds, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  const enc = Buffer.from(key).toString("base64url");
  const sig = sign(`${enc}.${scope}.${exp}`);
  return `/api/media/${enc}?s=${scope}&e=${exp}&sig=${sig}`;
}

export type MediaCheck = { ok: true; key: string } | { ok: false; status: 403 | 404 | 410; reason: string };

export function verifyMediaRequest(
  input: { encodedKey: string; scope: string | null; exp: string | null; sig: string | null },
  viewer: { role: Role; personId: string },
  now = Date.now(),
): MediaCheck {
  const { encodedKey, scope, exp, sig } = input;
  if (!scope || !exp || !sig) return { ok: false, status: 403, reason: "unsigned" };
  const expected = sign(`${encodedKey}.${scope}.${exp}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, status: 403, reason: "bad signature" };
  if (Number(exp) * 1000 < now) return { ok: false, status: 410, reason: "expired" };
  const key = Buffer.from(encodedKey, "base64url").toString();

  // Role binding: the URL's scope must match the viewer, and the key must match the scope.
  if (scope === "chef") {
    if (viewer.role !== "chef") return { ok: false, status: 403, reason: "scope/role mismatch" };
    if (!/^chef\/[0-9a-f-]+\.jpg$/.test(key)) return { ok: false, status: 403, reason: "chef keys resolve only to blurred derivatives" };
  } else if (scope === "partner") {
    if (viewer.role !== "partner_a" && viewer.role !== "partner_b") return { ok: false, status: 403, reason: "scope/role mismatch" };
    if (!key.startsWith(`crops/${viewer.personId}/`)) return { ok: false, status: 403, reason: "not your file" };
  } else {
    return { ok: false, status: 403, reason: "unknown scope" };
  }
  return { ok: true, key };
}
