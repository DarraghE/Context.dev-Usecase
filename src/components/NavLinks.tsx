"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  if (!items.length) return null;
  return (
    <nav className="nav" aria-label="Main">
      {items.map((i) => {
        const active = path === i.href || (i.href !== "/chef" && path.startsWith(i.href + "/"));
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
