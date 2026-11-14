"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EnrichmentPanel, type EnrichmentView } from "./EnrichmentPanel";
import { EventBadge, formatDay, PageHead } from "./ui";

type ReviewMemory = {
  id: string;
  dish: string;
  dish_description: string | null;
  status: "pending" | "approved" | "hidden";
  hidden_by_default: boolean;
  flags: { key: string; label: string }[];
  couple_note: string | null;
  significance: number;
  significance_parts: Record<string, number> | null;
  date: string | null;
  event_type: string;
  event_label: string;
  evidence: { quotes: string[]; reason: string | null; caption: string | null };
  place: { name: string; address: string | null; website: string | null } | null;
  place_status: string | null;
  image_url: string | null;
  enrichment: EnrichmentView | null;
};

const FILTERS = [
  { key: "pending", label: "To review" },
  { key: "approved", label: "Approved" },
  { key: "hidden", label: "Hidden" },
  { key: "all", label: "All" },
] as const;

const PART_LABEL: Record<string, string> = { event: "event", sentiment: "feeling", recurrence: "recurring dish", proximity: "near a key date", menu_match: "on the menu", friend_story: "friend story" };

function MemoryReviewCard({ m, onChange }: { m: ReviewMemory; onChange: (m: ReviewMemory) => void }) {
  const [note, setNote] = useState(m.couple_note ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    const r = await fetch(`/api/review/memories/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) onChange((await r.json()).memory);
  };
  const quote = m.evidence.quotes[0];
  return (
    <article className="card memory" aria-labelledby={`m-${m.id}`} data-testid="review-card" data-dish={m.dish}>
      <div className="card-media">
        {m.image_url ? (
          // Signed 5-minute URL to the partner's own food crop.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.image_url} alt={`Your photo: ${m.dish}`} loading="lazy" />
        ) : (
          <div className="placeholder">Mentioned in a caption — no photo</div>
        )}
        <div className="ribbon row">
          {m.status === "approved" ? <span className="badge badge-sage">Approved</span> : null}
          {m.status === "hidden" ? <span className="badge badge-danger">{m.hidden_by_default ? "Hidden by default" : "Hidden"}</span> : null}
        </div>
      </div>
      <div className="title-row">
        <h3 id={`m-${m.id}`}>{m.dish}</h3>
        <span className="score" title="Significance score (0–100)">
          {Math.round(m.significance)}
        </span>
      </div>
      <div className="meta">
        <EventBadge type={m.event_type} label={m.event_label} />
        <span>{formatDay(m.date)}</span>
        {m.place ? <span>{m.place.name}</span> : m.place_status === "private_home" ? <span>At home</span> : null}
      </div>
      {quote ? <p className="quote">“{quote}”</p> : m.evidence.caption ? <p className="quote">“{m.evidence.caption}”</p> : null}
      {m.flags.length ? (
        <div className={m.hidden_by_default ? "alert alert-warn" : "alert alert-info"} style={{ marginBottom: 12 }}>
          {m.hidden_by_default ? <strong>Hidden by default. </strong> : null}
          {m.flags.map((f) => f.label).join(" · ")}. {m.hidden_by_default ? "Approve it only if you want the chef to see it." : "Just a hint — it is not hidden."}
        </div>
      ) : null}
      <EnrichmentPanel e={m.enrichment} place={m.place} />
      {m.significance_parts ? (
        <div className="parts" aria-label="Why this score">
          {Object.entries(m.significance_parts)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => (
              <span key={k}>
                +{Math.round(v)} {PART_LABEL[k] ?? k}
              </span>
            ))}
        </div>
      ) : null}
      <hr className="divider" />
      {editing ? (
        <div className="stack">
          <label htmlFor={`note-${m.id}`}>A note for the chef</label>
          <textarea id={`note-${m.id}`} value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Sam still talks about the meringue." />
          <div className="row">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={async () => { await act({ action: "note", note }); setEditing(false); }}>
              Save note
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setNote(m.couple_note ?? ""); setEditing(false); }}>
              Cancel
            </button>
            <span className="muted small">{280 - note.length} left</span>
          </div>
        </div>
      ) : m.couple_note ? (
        <p className="small">
          <strong>Your note:</strong> {m.couple_note}
        </p>
      ) : null}
      <div className="row" style={{ marginTop: 8 }}>
        {m.status !== "approved" ? (
          <button className="btn btn-approve btn-sm" disabled={busy} onClick={() => act({ action: "approve" })} aria-label={`Approve ${m.dish}`}>
            Approve
          </button>
        ) : null}
        {m.status !== "hidden" ? (
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act({ action: "hide" })} aria-label={`Hide ${m.dish}`}>
            Hide
          </button>
        ) : null}
        {!editing ? (
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            {m.couple_note ? "Edit note" : "Add a note"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

/** §11.5 Partner › Review (US-6): own memories by significance; approve / hide / note. */
export function ReviewQueue() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("pending");
  const [all, setAll] = useState<ReviewMemory[] | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/review/memories", { cache: "no-store" });
    if (r.ok) setAll((await r.json()).memories);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!all) return <p className="row muted"><span className="spinner" aria-hidden="true" /> Loading…</p>;
  const counts = { pending: all.filter((m) => m.status === "pending").length, approved: all.filter((m) => m.status === "approved").length, hidden: all.filter((m) => m.status === "hidden").length, all: all.length };
  const shown = filter === "all" ? all : all.filter((m) => m.status === filter);
  const update = (m: ReviewMemory) => setAll((xs) => xs!.map((x) => (x.id === m.id ? m : x)));

  return (
    <div className="stack-lg">
      <PageHead eyebrow="Step 4 of 4" title="Review your food memories">
        Sorted by how significant each moment looks. Only what you approve reaches the chef — with faces blurred. Your partner can&apos;t see your unapproved memories.
      </PageHead>
      <div className="row-between">
        <div className="segmented" role="tablist" aria-label="Filter memories">
          {FILTERS.map((f) => (
            <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label} ({counts[f.key]})
            </button>
          ))}
        </div>
        {counts.approved ? <span className="badge badge-sage">{counts.approved} shared with the chef</span> : null}
      </div>
      {all.length === 0 ? (
        <div className="card empty">
          <h2>No memories yet</h2>
          <p>Once your exports are processed, the meals we find will appear here.</p>
          <Link className="btn btn-primary" href="/partner/upload">
            Upload an export
          </Link>
        </div>
      ) : shown.length === 0 ? (
        <div className="card empty">
          <p>Nothing here.</p>
        </div>
      ) : (
        <div className="grid">
          {shown.map((m) => (
            <MemoryReviewCard key={m.id} m={m} onChange={update} />
          ))}
        </div>
      )}
    </div>
  );
}
