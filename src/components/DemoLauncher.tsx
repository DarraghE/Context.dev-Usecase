"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Demo-only: signs in as the demo caterer (DEMO_MODE=1). */
export function DemoLauncher() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack" style={{ marginTop: 0 }}>
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await fetch("/api/demo/caterer-link", { method: "POST" });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error ?? "failed");
            router.push(j.path);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? <span className="spinner" aria-hidden="true" /> : null}
        Open the caterer demo
      </button>
      {error ? (
        <p className="alert alert-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
