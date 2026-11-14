import Link from "next/link";
import type { Viewer } from "@/lib/viewer";
import { NavLinks } from "./NavLinks";

const NAV: Record<string, { href: string; label: string }[]> = {
  caterer_admin: [{ href: "/caterer", label: "Bookings" }],
  partner_a: [
    { href: "/partner/consent", label: "Consent" },
    { href: "/partner/upload", label: "Upload" },
    { href: "/partner/processing", label: "Processing" },
    { href: "/partner/review", label: "Review" },
  ],
  partner_b: [
    { href: "/partner/consent", label: "Consent" },
    { href: "/partner/upload", label: "Upload" },
    { href: "/partner/processing", label: "Processing" },
    { href: "/partner/review", label: "Review" },
  ],
  chef: [
    { href: "/chef", label: "Memories" },
    { href: "/chef/menu", label: "Menu builder" },
  ],
};

export function AppShell({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  const role = viewer.session.role;
  const subtitle = viewer.booking ? `${viewer.booking.coupleDisplayName} · ${viewer.caterer?.name ?? ""}` : viewer.caterer?.name ?? "";
  return (
    <>
      <header className="site-header">
        <div className="container bar">
          <Link href="/" className="brand" aria-label="Wedding Food Memory home">
            <span className="brand-mark" aria-hidden="true">
              ♥
            </span>
            <span>
              Wedding Food Memory
              <small>{subtitle}</small>
            </span>
          </Link>
          <NavLinks items={NAV[role] ?? []} />
          <div className="who">
            <span className="badge">{role === "caterer_admin" ? "Caterer" : role === "chef" ? "Chef" : "Partner"}</span>
            <span>{viewer.person.displayName}</span>
            <form action="/api/auth/logout" method="post">
              <button className="btn btn-ghost btn-sm" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main">
        <div className="container">{children}</div>
      </main>
    </>
  );
}

export function PublicHeader() {
  return (
    <header className="site-header">
      <div className="container bar">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            ♥
          </span>
          <span>
            Wedding Food Memory
            <small>A catering add-on</small>
          </span>
        </Link>
        <nav className="nav" aria-label="Site">
          <Link href="/#how">How it works</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </div>
    </header>
  );
}
