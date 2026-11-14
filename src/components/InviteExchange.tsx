"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Exchanges the single-use magic link for a session cookie, then redirects by role. */
export function InviteExchange({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const r = await fetch(`/api/invites/${encodeURIComponent(token)}/exchange`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error ?? "This link could not be used.");
        return;
      }
      router.replace(j.redirect);
      router.refresh();
    })();
  }, [token, router]);
  return (
    <div className="card stack" style={{ marginTop: 40 }} aria-live="polite">
      {error ? (
        <>
          <h1>Link not valid</h1>
          <p>{error}</p>
          <p className="muted small">Each personal link works once. If you already used it on another device, ask your caterer for a fresh one.</p>
        </>
      ) : (
        <>
          <h1>Signing you in…</h1>
          <p className="row muted">
            <span className="spinner" aria-hidden="true" /> Checking your personal link.
          </p>
        </>
      )}
    </div>
  );
}
