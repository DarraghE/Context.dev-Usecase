"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { BookingStatus } from "@/pipeline/status";
import { PageHead, Progress } from "./ui";

const EXPLAIN: Record<string, string> = {
  parsed: "We read the export's structure and list every photo, caption and check-in.",
  food: "Claude looks at each photo once to find food and drink. Only a crop of the food is kept.",
  text: "Captions are read for dishes and life events (proposal, first date, trips…).",
  moments: "Photos from the same day and place become one moment.",
  places: "Restaurants are identified from tags and coordinates. Homes are skipped.",
  menus: "Context.dev reads each restaurant's public website to find the dish on its menu.",
  scored: "Each memory gets a significance score and sensitive ones start hidden.",
};

/** §11.4 Partner › Processing: stage progress bars for this partner's own data. */
export function ProcessingView({ bookingId }: { bookingId: string }) {
  const [s, setS] = useState<BookingStatus | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/bookings/${bookingId}/status?scope=me`, { cache: "no-store" });
    if (r.ok) setS(await r.json());
  }, [bookingId]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [load]);

  if (!s) return <p className="row muted"><span className="spinner" aria-hidden="true" /> Loading…</p>;
  const stalled = !s.processing && s.jobs.failed > 0;
  const finished = !s.processing && !stalled && s.uploads.total > 0 && s.uploads.total > s.uploads.failed;
  const memories = s.counts.memories.pending + s.counts.memories.approved + s.counts.memories.hidden;

  return (
    <div className="stack-lg narrow" style={{ margin: "0 auto" }}>
      <PageHead eyebrow="Step 3 of 4" title={finished ? "Your food memories are ready" : stalled ? "Processing paused" : s.uploads.total ? "Finding your food memories…" : "Nothing to process yet"}>
        {finished
          ? `We found ${s.counts.food_photos} food photos and ${memories} memories. Your export files have been deleted.`
          : s.uploads.total
            ? "This usually takes a few minutes. You can leave this page; processing continues."
            : "Upload at least one export to start."}
      </PageHead>

      {stalled ? (
        <div className="alert alert-warn" role="status">
          A processing step stopped ({s.jobs.failed} failed). It was logged; withdrawing and giving consent again, or uploading the export again, restarts it.
        </div>
      ) : null}

      <section className="card stack" aria-live="polite" aria-label="Processing stages">
        {s.stages.map((st) => (
          <div className="stage" key={st.key}>
            <span style={{ fontWeight: 600 }}>{st.label}</span>
            <span className="muted small">
              {st.done}/{st.total}
            </span>
            <Progress value={st.done} total={st.total} label={st.label} />
            <span className="muted small" style={{ gridColumn: "1 / -1" }}>
              {EXPLAIN[st.key]}
            </span>
          </div>
        ))}
      </section>

      {Object.keys(s.skipped).length ? (
        <section className="card flat">
          <h2 style={{ fontSize: "1.1rem" }}>Skipped</h2>
          <div className="kv">
            {Object.entries(s.skipped).map(([k, v]) => (
              <span key={k}>
                {v} × {k}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {s.counts.enrichments.ok + s.counts.enrichments.no_menu + s.counts.enrichments.menu_is_image > 0 ? (
        <section className="card soft">
          <h2 style={{ fontSize: "1.1rem" }}>Restaurants checked with Context.dev</h2>
          <div className="kv">
            <span>{s.counts.enrichments.ok} menus read</span>
            <span>{s.counts.enrichments.menu_is_image} menus only as images</span>
            <span>{s.counts.enrichments.no_menu} without a readable menu</span>
            {s.counts.enrichments.error ? <span>{s.counts.enrichments.error} errors (logged, not blocking)</span> : null}
          </div>
        </section>
      ) : null}

      <div className="row">
        <Link className={`btn ${finished ? "btn-primary" : "btn-secondary"}`} href="/partner/review" aria-disabled={!memories}>
          Review my memories{memories ? ` (${memories})` : ""}
        </Link>
        <Link className="btn btn-ghost" href="/partner/upload">
          Upload another export
        </Link>
      </div>
    </div>
  );
}
