"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EnrichmentPanel, type EnrichmentView } from "./EnrichmentPanel";
import { EventBadge, formatDay } from "./ui";

export type ChefMemory = {
  id: string;
  dish: string;
  dish_description: string | null;
  category: string | null;
  significance: number;
  date: string | null;
  event_type: string;
  event_label: string;
  event_quote: string | null;
  couple_note: string | null;
  place: { name: string; address: string | null; city: string | null; website: string | null } | null;
  image_url: string | null;
  enrichment: (EnrichmentView & { menu_sections?: { section: string; items: { name: string; description?: string; price?: string | null; dietary_tags?: string[] }[] }[]; pages?: { url: string; items: number; status: string }[] }) | null;
};

export function ChefMemoryCard({ m, rank }: { m: ChefMemory; rank?: number }) {
  return (
    <article className="card memory" aria-labelledby={`c-${m.id}`} data-testid="chef-card" data-dish={m.dish}>
      <div className="memory-h">
        <div className="thumb">
          {m.image_url ? (
            // Face-blurred derivative, signed for 5 minutes and bound to the chef role.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.image_url} alt={`${m.dish} (faces blurred)`} loading="lazy" />
          ) : (
            <span className="muted small" style={{ padding: 12, textAlign: "center" }}>
              No image shared
            </span>
          )}
        </div>
        <div>
          <div className="title-row">
            <h3 id={`c-${m.id}`}>
              {rank ? <span className="muted">#{rank} </span> : null}
              <Link href={`/chef/memories/${m.id}`} style={{ color: "inherit" }}>
                {m.dish}
              </Link>
            </h3>
            <span className="score" title="Significance (0–100)">
              {Math.round(m.significance)}
            </span>
          </div>
          <div className="meta">
            <EventBadge type={m.event_type} label={m.event_label} />
            <span>{formatDay(m.date)}</span>
            {m.place ? <span>{m.place.name}{m.place.city ? `, ${m.place.city.split(",")[0]}` : ""}</span> : <span>Home-cooked or no venue</span>}
          </div>
          {m.dish_description ? <p className="small muted" style={{ marginBottom: 6 }}>{m.dish_description}</p> : null}
          {m.event_quote ? <p className="quote">“{m.event_quote}”</p> : null}
          {m.couple_note ? (
            <p className="small">
              <strong>From the couple:</strong> {m.couple_note}
            </p>
          ) : null}
          <EnrichmentPanel e={m.enrichment} place={m.place} />
        </div>
      </div>
    </article>
  );
}

/** §11.6 Chef › Overview (US-7 AC1/AC2): approved memories as a timeline or a ranked list. */
export function ChefOverview() {
  const [view, setView] = useState<"timeline" | "ranked">("ranked");
  const [items, setItems] = useState<ChefMemory[] | null>(null);
  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/chef/memories?view=${view}`, { cache: "no-store" });
      if (r.ok) setItems((await r.json()).memories);
    })();
  }, [view]);

  return (
    <section className="stack" aria-labelledby="mem-h">
      <div className="row-between">
        <h2 id="mem-h" style={{ margin: 0 }}>
          Approved memories {items ? <span className="muted">({items.length})</span> : null}
        </h2>
        <div className="segmented" role="group" aria-label="View">
          <button aria-pressed={view === "ranked"} onClick={() => setView("ranked")}>
            Most significant
          </button>
          <button aria-pressed={view === "timeline"} onClick={() => setView("timeline")}>
            Timeline
          </button>
        </div>
      </div>
      {!items ? (
        <p className="row muted">
          <span className="spinner" aria-hidden="true" /> Loading…
        </p>
      ) : items.length === 0 ? (
        <div className="card empty">
          <h3>Nothing approved yet</h3>
          <p>The couple is still reviewing. Approved memories appear here automatically.</p>
        </div>
      ) : view === "ranked" ? (
        <div className="stack">
          {items.map((m, i) => (
            <ChefMemoryCard key={m.id} m={m} rank={i + 1} />
          ))}
        </div>
      ) : (
        <ol className="timeline" aria-label="Timeline, oldest first">
          {items.map((m) => (
            <li key={m.id}>
              <div className="when">{formatDay(m.date)}</div>
              <ChefMemoryCard m={m} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
