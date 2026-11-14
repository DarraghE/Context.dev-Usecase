import { describe, expect, it } from "vitest";
import { exchangeInvite, issueInvite } from "@/lib/bookings";
import { checkAccess } from "@/privacy/guards";
import { signSession, verifySession, type Role, type Session } from "@/privacy/session";
import { significance } from "@/scoring/significance";
import { freshBooking } from "./helpers";

const s = (role: Role): Session => ({ personId: "p", role, bookingId: "b", catererId: role === "caterer_admin" ? "c" : null });

describe("magic links (§3)", () => {
  it("exchange once for a session; a second exchange fails", async () => {
    const b = await freshBooking();
    const url = await issueInvite(b.a);
    const token = new URL(url).pathname.split("/").pop()!;
    const first = await exchangeInvite(token);
    expect(first).toMatchObject({ personId: b.a, role: "partner_a", bookingId: b.bookingId });
    expect(await exchangeInvite(token)).toBeNull();
    expect(await exchangeInvite(token.slice(0, -3) + "abc")).toBeNull();
  });

  it("sessions round-trip and reject tampering", async () => {
    const tok = await signSession(s("chef"));
    expect(await verifySession(tok)).toMatchObject({ role: "chef" });
    expect(await verifySession(tok.replace(/.$/, tok.endsWith("A") ? "B" : "A"))).toBeNull();
  });
});

describe("route guards (src/privacy/guards.ts)", () => {
  const cases: [string, Role | null, boolean][] = [
    ["/api/chef/memories", "chef", true],
    ["/api/chef/memories", "partner_a", false],
    ["/api/chef/menus", "caterer_admin", false],
    ["/api/review/memories", "partner_b", true],
    ["/api/review/memories", "chef", false],
    ["/api/uploads", "partner_a", true],
    ["/api/uploads", "chef", false],
    ["/api/bookings", "caterer_admin", true],
    ["/api/bookings", "partner_a", false],
    ["/api/bookings/x/delete", "chef", false],
    ["/api/bookings/x/status", "chef", true],
    ["/api/consent", "caterer_admin", false],
    ["/api/chef/memories", null, false],
    ["/api/invites/t/exchange", null, true],
    ["/api/unknown", "chef", false],
    ["/chef/menu", "partner_a", false],
    ["/partner/review", "partner_b", true],
    ["/caterer", "chef", false],
  ];
  it.each(cases)("%s as %s → %s", (p, role, allowed) => {
    expect(checkAccess(p, role ? s(role) : null).ok).toBe(allowed);
  });
});

describe("significance score (§7.7)", () => {
  it("follows the formula and stores each component", () => {
    const r = significance({ eventType: "proposal", eventConfidence: 1, sentiment: 1, recurrenceMoments: 3, daysToKeyMoment: 0, menuMatchConfidence: 0.9 });
    expect(r.parts).toEqual({ event: 45, sentiment: 15, recurrence: 15, proximity: 10, menu_match: 5, friend_story: 0 });
    expect(r.score).toBe(90);
    expect(significance({ eventType: "everyday", eventConfidence: 0.5, sentiment: -0.5, recurrenceMoments: 2, daysToKeyMoment: 2, menuMatchConfidence: 0.6 }).score).toBe(10.5);
  });
});
