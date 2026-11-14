"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDay, PageHead } from "./ui";

type ConsentInfo = {
  sections: { heading: string; body: string[] }[];
  version: string;
  couple: string;
  wedding_date: string;
  caterer: string;
  consented: boolean;
  granted_at: string | null;
  relationship_start_date: string | null;
};

/** §11.2 Partner › Consent (US-1): full text, optional relationship start date, consent; withdraw. */
export function ConsentForm() {
  const router = useRouter();
  const [info, setInfo] = useState<ConsentInfo | null>(null);
  const [agree, setAgree] = useState(false);
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "danger"; text: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const load = async () => {
    const r = await fetch("/api/consent", { cache: "no-store" });
    if (r.ok) setInfo(await r.json());
  };
  useEffect(() => {
    void load();
  }, []);

  if (!info) return <p className="row muted"><span className="spinner" aria-hidden="true" /> Loading…</p>;

  const give = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await fetch("/api/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: info.version, relationshipStartDate: start || null }) });
    setBusy(false);
    if (r.ok) {
      router.push("/partner/upload");
      router.refresh();
    } else setMsg({ kind: "danger", text: (await r.json().catch(() => ({}))).error ?? "Could not save your consent." });
  };

  const withdraw = async () => {
    setBusy(true);
    const r = await fetch("/api/consent/withdraw", { method: "POST" });
    setBusy(false);
    dialog.current?.close();
    if (r.ok) {
      const j = await r.json();
      const n = Object.values(j.deleted as Record<string, number>).reduce((a, b) => a + b, 0);
      setMsg({ kind: "success", text: `Consent withdrawn. ${n} records and files were deleted. You can consent again at any time.` });
      setAgree(false);
      await load();
      router.refresh();
    }
  };

  return (
    <div className="stack-lg">
      <PageHead eyebrow={`${info.couple} · ${formatDay(info.wedding_date)}`} title={info.consented ? "Your consent" : "Before you share anything"}>
        {info.consented
          ? `You consented on ${new Date(info.granted_at!).toLocaleString("en-GB")}.`
          : `${info.caterer} offers Wedding Food Memory with your catering package. Please read what happens to your data. Your partner decides separately for their own data.`}
      </PageHead>

      {msg ? (
        <div className={`alert alert-${msg.kind}`} role="status">
          {msg.text}
        </div>
      ) : null}

      <section className="card stack" aria-labelledby="terms-h">
        <h2 id="terms-h" className="visually-hidden">
          Consent text
        </h2>
        {info.sections.map((s) => (
          <div key={s.heading}>
            <h3>{s.heading}</h3>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {s.body.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ))}
        <p className="muted small" style={{ marginTop: 16 }}>
          Consent text version <span className="code" style={{ padding: "1px 6px" }}>{info.version.slice(0, 12)}</span> — stored with your consent, the time and your IP address.
        </p>
      </section>

      {info.consented ? (
        <section className="card stack" aria-labelledby="withdraw-h">
          <h2 id="withdraw-h">Withdraw consent</h2>
          <p className="muted">Withdrawing deletes your uploads, every memory found in them, any links to restaurant menus, and menu drafts that used them — immediately. Your partner&apos;s data is not affected.</p>
          <div className="row">
            <Link className="btn btn-primary" href="/partner/upload">
              Continue to upload
            </Link>
            <button className="btn btn-danger" onClick={() => dialog.current?.showModal()}>
              Withdraw and delete my data…
            </button>
          </div>
        </section>
      ) : (
        <form className="card stack" onSubmit={give} aria-labelledby="give-h">
          <h2 id="give-h">Your consent</h2>
          <div>
            <label htmlFor="start">When did your relationship start? (optional)</label>
            <input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} max={info.wedding_date} aria-describedby="start-hint" style={{ maxWidth: 240 }} />
            <p className="hint" id="start-hint">
              Used only to keep romantic moments from before you met (for example with a previous partner) hidden by default.
            </p>
          </div>
          <div className="checkbox">
            <input id="agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
            <label htmlFor="agree" style={{ fontWeight: 500, margin: 0 }}>
              I have read the above and consent to my uploads being processed for our wedding menu only.
            </label>
          </div>
          <div>
            <button className="btn btn-primary" type="submit" disabled={!agree || busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : null}I consent
            </button>
          </div>
        </form>
      )}

      <dialog ref={dialog} aria-labelledby="wd-h">
        <div className="stack">
          <h2 id="wd-h">Withdraw consent?</h2>
          <p>Your uploads, memories and menu links will be deleted now. This can&apos;t be undone.</p>
          <div className="row">
            <button className="btn btn-danger" onClick={withdraw} disabled={busy}>
              Withdraw and delete
            </button>
            <button className="btn btn-secondary" onClick={() => dialog.current?.close()}>
              Keep my consent
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
