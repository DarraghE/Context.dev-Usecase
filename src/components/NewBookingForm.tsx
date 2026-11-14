"use client";

import Link from "next/link";
import { useState } from "react";
import { InviteLinks } from "./InviteLinks";

type Person = { name: string; email: string };

const DEMO = {
  coupleDisplayName: "Aino & Sam",
  weddingDate: "2027-06-12",
  partnerA: { name: "Aino Laine", email: "aino.laine@example.com" },
  partnerB: { name: "Sam Carter", email: "sam.carter@example.com" },
  chef: { name: "Chef Elias Nyström", email: "elias@juhla-catering.example" },
  allergies: "nut allergy",
  vegan: 2,
  vegetarian: 0,
  glutenFree: 0,
  notes: "1 guest with a severe nut allergy (tree nuts). 2 vegan guests.",
};
const EMPTY = { coupleDisplayName: "", weddingDate: "", partnerA: { name: "", email: "" }, partnerB: { name: "", email: "" }, chef: { name: "", email: "" }, allergies: "", vegan: 0, vegetarian: 0, glutenFree: 0, notes: "" };

function PersonFields({ legend, value, onChange, id }: { legend: string; value: Person; onChange: (p: Person) => void; id: string }) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="grid-2">
        <div>
          <label htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} type="text" required value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} autoComplete="off" />
        </div>
        <div>
          <label htmlFor={`${id}-email`}>Email</label>
          <input id={`${id}-email`} type="email" required value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} autoComplete="off" />
        </div>
      </div>
    </fieldset>
  );
}

export function NewBookingForm({ demo }: { demo: boolean }) {
  const [f, setF] = useState(demo ? DEMO : EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ bookingId: string; invites: Record<string, { name: string; url: string }> } | null>(null);

  if (created) {
    return (
      <div className="stack-lg">
        <div className="alert alert-success" role="status">
          Booking created for <strong>{f.coupleDisplayName}</strong>. Send each person their own link — each works once.
        </div>
        <InviteLinks invites={created.invites} />
        <div className="row">
          <Link className="btn btn-primary" href={`/caterer/bookings/${created.bookingId}`}>
            View booking status
          </Link>
          <Link className="btn btn-secondary" href="/caterer">
            All bookings
          </Link>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const diets: Record<string, number> = {};
    if (f.vegan) diets.vegan = Number(f.vegan);
    if (f.vegetarian) diets.vegetarian = Number(f.vegetarian);
    if (f.glutenFree) diets.gluten_free = Number(f.glutenFree);
    const body = {
      coupleDisplayName: f.coupleDisplayName,
      weddingDate: f.weddingDate,
      partnerA: f.partnerA,
      partnerB: f.partnerB,
      chef: f.chef,
      dietary: { allergies: f.allergies.split(",").map((s) => s.trim()).filter(Boolean), diets, notes: f.notes },
    };
    const r = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setError(j.error === "invalid request" ? "Please check the highlighted fields." : (j.error ?? "Could not create the booking."));
      return;
    }
    setCreated(j);
  };

  return (
    <form className="stack-lg" onSubmit={submit} noValidate={false}>
      <fieldset>
        <legend>Wedding</legend>
        <div className="grid-2">
          <div>
            <label htmlFor="couple">Couple</label>
            <input id="couple" type="text" required value={f.coupleDisplayName} onChange={(e) => setF({ ...f, coupleDisplayName: e.target.value })} />
          </div>
          <div>
            <label htmlFor="date">Wedding date</label>
            <input id="date" type="date" required value={f.weddingDate} onChange={(e) => setF({ ...f, weddingDate: e.target.value })} />
            <p className="hint">All data is deleted automatically 30 days after this date.</p>
          </div>
        </div>
      </fieldset>
      <PersonFields legend="Partner A" id="pa" value={f.partnerA} onChange={(p) => setF({ ...f, partnerA: p })} />
      <PersonFields legend="Partner B" id="pb" value={f.partnerB} onChange={(p) => setF({ ...f, partnerB: p })} />
      <PersonFields legend="Chef" id="chef" value={f.chef} onChange={(p) => setF({ ...f, chef: p })} />
      <fieldset>
        <legend>Dietary constraints</legend>
        <div className="field">
          <label htmlFor="allergies">Allergies</label>
          <input id="allergies" type="text" value={f.allergies} onChange={(e) => setF({ ...f, allergies: e.target.value })} aria-describedby="allergies-hint" />
          <p className="hint" id="allergies-hint">
            Comma-separated, e.g. “nut allergy, shellfish”. Every menu course is checked against these in code.
          </p>
        </div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", marginTop: 14 }}>
          {(
            [
              ["vegan", "Vegan guests"],
              ["vegetarian", "Vegetarian guests"],
              ["glutenFree", "Gluten-free guests"],
            ] as const
          ).map(([k, l]) => (
            <div key={k}>
              <label htmlFor={k}>{l}</label>
              <input id={k} type="number" min={0} value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} />
            </div>
          ))}
        </div>
        <div className="field">
          <label htmlFor="notes">Notes for the chef</label>
          <textarea id="notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>
      </fieldset>
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          Create booking and invite links
        </button>
        {demo ? <span className="muted small">Pre-filled with the synthetic demo couple.</span> : null}
      </div>
    </form>
  );
}
