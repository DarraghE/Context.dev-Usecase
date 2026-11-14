"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BookingStatus } from "@/pipeline/status";
import { InviteLinks } from "./InviteLinks";
import { formatDay, PageHead, Progress } from "./ui";

/** §11.9 Caterer › Booking status: counts only, plus delete-now behind a confirmation. */
export function BookingStatusView({ bookingId }: { bookingId: string }) {
  const [s, setS] = useState<BookingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<Record<string, { name: string; url: string }> | null>(null);
  const [confirm, setConfirm] = useState("");
  const [deleted, setDeleted] = useState<Record<string, number> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/bookings/${bookingId}/status`, { cache: "no-store" });
    if (!r.ok) {
      setError((await r.json().catch(() => ({}))).error ?? "Could not load status");
      return;
    }
    setS(await r.json());
  }, [bookingId]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!s) return <p className="row muted"><span className="spinner" aria-hidden="true" /> Loading…</p>;

  const isDeleted = s.booking.status === "deleted";
  return (
    <div className="stack-lg">
      <PageHead
        eyebrow="Booking status"
        title={s.booking.couple_display_name}
        actions={
          <Link className="btn btn-secondary" href="/caterer">
            All bookings
          </Link>
        }
      >
        Wedding {formatDay(s.booking.wedding_date)} · everything auto-deletes after {formatDay(s.booking.delete_after)}. You see counts only — never photos or memories.
      </PageHead>

      {deleted ? (
        <div className="alert alert-success" role="status">
          Deleted: {Object.entries(deleted).filter(([, v]) => v).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(", ") || "nothing left to delete"}. The deletion is recorded in the audit log.
        </div>
      ) : null}

      <section className="stats" aria-label="Progress counts">
        <div className="stat">
          <div className="value">{s.partners.filter((p) => p.consented).length}/2</div>
          <div className="label">Partners consented</div>
        </div>
        <div className="stat">
          <div className="value">{s.uploads.total}</div>
          <div className="label">Exports uploaded</div>
        </div>
        <div className="stat">
          <div className="value">{s.counts.food_photos}</div>
          <div className="label">Food photos found</div>
        </div>
        <div className="stat">
          <div className="value">{s.counts.moments}</div>
          <div className="label">Moments</div>
        </div>
        <div className="stat">
          <div className="value">{s.counts.enrichments.ok}</div>
          <div className="label">Menus read (Context.dev)</div>
        </div>
        <div className="stat">
          <div className="value">{s.counts.memories.approved}</div>
          <div className="label">Approved for the chef</div>
        </div>
      </section>

      <div className="grid-2">
        <section className="card stack" aria-labelledby="stages-h">
          <h2 id="stages-h">Processing</h2>
          {s.stages.map((st) => (
            <div className="stage" key={st.key}>
              <span>{st.label}</span>
              <span className="muted small">
                {st.done}/{st.total}
              </span>
              <Progress value={st.done} total={st.total} label={st.label} />
            </div>
          ))}
          {s.jobs.failed ? <p className="alert alert-warn">{s.jobs.failed} processing step(s) failed and were logged.</p> : null}
        </section>
        <section className="card stack" aria-labelledby="people-h">
          <h2 id="people-h">People</h2>
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {s.partners.map((p) => (
              <li key={p.role} className="row-between">
                <span>{p.display_name}</span>
                <span className={p.consented ? "badge badge-sage" : "badge"}>{p.consented ? "Consented" : "Not yet consented"}</span>
              </li>
            ))}
          </ul>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted small">
              Memories: {s.counts.memories.pending} pending · {s.counts.memories.approved} approved · {s.counts.memories.hidden} hidden
            </span>
          </div>
          {!isDeleted ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                const r = await fetch(`/api/bookings/${bookingId}/invites`, { method: "POST" });
                if (r.ok) setInvites((await r.json()).invites);
              }}
            >
              Issue fresh invite links
            </button>
          ) : null}
        </section>
      </div>

      {invites ? (
        <section aria-label="Fresh invite links">
          <InviteLinks invites={invites} />
        </section>
      ) : null}

      <section className="card stack" aria-labelledby="delete-h" style={{ borderColor: "#f3c7ca" }}>
        <h2 id="delete-h">Delete everything now</h2>
        <p className="muted">Removes uploads, photos, memories, menus and every enrichment link for this booking. This can&apos;t be undone. Otherwise deletion runs automatically on {formatDay(s.booking.delete_after)}.</p>
        <div>
          <button className="btn btn-danger" disabled={isDeleted} onClick={() => dialog.current?.showModal()}>
            {isDeleted ? "Booking deleted" : "Delete booking data…"}
          </button>
        </div>
      </section>

      <dialog ref={dialog} aria-labelledby="confirm-h">
        <form
          className="stack"
          method="dialog"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await fetch(`/api/bookings/${bookingId}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) });
            const j = await r.json().catch(() => ({}));
            if (r.ok) {
              setDeleted(j.counts);
              dialog.current?.close();
              void load();
            }
          }}
        >
          <h2 id="confirm-h">Delete all data for {s.booking.couple_display_name}?</h2>
          <p>This permanently deletes everything for this booking. Type <strong>DELETE</strong> to confirm.</p>
          <label htmlFor="confirm-input">Confirmation</label>
          <input id="confirm-input" type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          <div className="row">
            <button className="btn btn-danger" type="submit" disabled={confirm !== "DELETE"}>
              Delete permanently
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
