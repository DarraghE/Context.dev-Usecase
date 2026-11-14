"use client";

import { useState } from "react";

const ROLE: Record<string, string> = { partner_a: "Partner A", partner_b: "Partner B", chef: "Chef" };

/** Shows single-use invite links (made relative to the current origin) with copy buttons. */
export function InviteLinks({ invites }: { invites: Record<string, { name: string; url: string }> }) {
  const [copied, setCopied] = useState<string | null>(null);
  const local = (u: string) => {
    try {
      return `${window.location.origin}${new URL(u).pathname}`;
    } catch {
      return u;
    }
  };
  const order = ["partner_a", "partner_b", "chef"].filter((r) => invites[r]);
  return (
    <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {order.map((role) => {
        const inv = invites[role]!;
        const url = local(inv.url);
        return (
          <li key={role} className="card flat">
            <div className="row-between">
              <div>
                <span className="badge badge-brand">{ROLE[role]}</span> <strong>{inv.name}</strong>
              </div>
              <div className="row">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(url).catch(() => undefined);
                    setCopied(role);
                    setTimeout(() => setCopied(null), 1800);
                  }}
                >
                  {copied === role ? "Copied" : "Copy link"}
                </button>
                <a className="btn btn-primary btn-sm" href={url} target="_blank" rel="noreferrer" data-testid={`invite-${role}`}>
                  Open in new tab
                </a>
              </div>
            </div>
            <div className="code" style={{ marginTop: 10 }}>
              {url}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
