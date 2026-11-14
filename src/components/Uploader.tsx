"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { Progress } from "./ui";

type UploadRow = { id: string; platform: string; name: string | null; bytes: number; status: string; stats: Record<string, number>; error: string | null; created_at: string };
type Local = { key: string; name: string; sent: number; total: number; state: "uploading" | "done" | "error"; error?: string };

const PLATFORMS = [
  {
    key: "instagram",
    name: "Instagram",
    color: "#c13584",
    letter: "IG",
    help: "https://help.instagram.com/181231772500920",
    steps: ["Accounts Centre → Your information and permissions → Download your information.", "Choose your Instagram account, “Some of your information”: Posts.", "Format: JSON. Media quality: Medium. Date range: All time."],
  },
  {
    key: "facebook",
    name: "Facebook",
    color: "#1877f2",
    letter: "f",
    help: "https://www.facebook.com/help/212802592074644",
    steps: ["Accounts Centre → Your information and permissions → Download your information.", "Choose your Facebook profile and “Posts” (includes check-ins and photos).", "Format: JSON. Date range: All time."],
  },
  {
    key: "google_photos",
    name: "Google Photos",
    color: "#188038",
    letter: "G",
    help: "https://support.google.com/accounts/answer/3024190",
    steps: ["Go to takeout.google.com and select only Google Photos.", "Export once, as .zip, 2 GB or larger file size.", "Download every part and upload each .zip here."],
  },
];

const PLATFORM_NAME: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", google_photos: "Google Photos", unknown: "Unrecognised" };
const STATUS: Record<string, string> = { uploaded: "Queued", parsing: "Reading", parsed: "Finding food", failed: "Rejected", raw_deleted: "Processed · file deleted" };

function fmtBytes(n: number) {
  if (n > 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n > 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1e3))} KB`;
}

/** §11.3 Partner › Upload (US-2): platform how-tos, resumable tus drop zone, progress and skip reasons. */
export function Uploader({ demo, role }: { demo: boolean; role: string }) {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [local, setLocal] = useState<Local[]>([]);
  const [over, setOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/uploads", { cache: "no-store" });
    if (r.ok) setRows((await r.json()).uploads);
  }, []);
  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  const start = (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const key = `${file.name}-${file.size}-${Date.now()}`;
      if (!/\.zip$/i.test(file.name)) {
        setLocal((l) => [...l, { key, name: file.name, sent: 0, total: file.size, state: "error", error: "Please upload the .zip file exactly as the platform delivered it." }]);
        continue;
      }
      setLocal((l) => [...l, { key, name: file.name, sent: 0, total: file.size, state: "uploading" }]);
      const up = new tus.Upload(file, {
        endpoint: "/api/uploads",
        chunkSize: 8 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        removeFingerprintOnSuccess: true,
        metadata: { filename: file.name, filetype: file.type || "application/zip" },
        onProgress: (sent, total) => setLocal((l) => l.map((x) => (x.key === key ? { ...x, sent, total } : x))),
        onError: (err) => {
          const body = (err as tus.DetailedError).originalResponse?.getBody?.();
          setLocal((l) => l.map((x) => (x.key === key ? { ...x, state: "error", error: body || err.message } : x)));
        },
        onSuccess: () => {
          setLocal((l) => l.map((x) => (x.key === key ? { ...x, state: "done", sent: x.total } : x)));
          void refresh();
        },
      });
      // Resume an interrupted upload of the same file if one exists (tus fingerprint).
      up.findPreviousUploads().then((prev) => {
        if (prev.length) up.resumeFromPreviousUpload(prev[0]!);
        up.start();
      });
    }
  };

  const sample = async (which: string) => {
    setNotice(null);
    const r = await fetch("/api/uploads/sample", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ which }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setNotice(j.error ?? "Sample upload failed");
    void refresh();
  };

  const processing = rows.some((r) => r.status === "uploaded" || r.status === "parsing" || r.status === "parsed");
  const anyDone = rows.some((r) => r.status === "raw_deleted");

  return (
    <div className="stack-lg">
      <section className="grid" aria-label="How to download your exports">
        {PLATFORMS.map((p) => (
          <article key={p.key} className="card platform">
            <div className="row">
              <span className="platform-icon" style={{ background: p.color }} aria-hidden="true">
                {p.letter}
              </span>
              <h2 style={{ margin: 0, fontSize: "1.2rem" }}>{p.name}</h2>
            </div>
            <ol>
              {p.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <a href={p.help} target="_blank" rel="noreferrer" className="small">
              {p.name} help: download your data ↗
            </a>
          </article>
        ))}
      </section>

      <section
        className={`dropzone${over ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          start(e.dataTransfer.files);
        }}
        aria-labelledby="drop-h"
      >
        <h2 id="drop-h" style={{ fontSize: "1.25rem" }}>
          Drop your .zip exports here
        </h2>
        <p className="muted">Up to 5 GB each. Uploads resume automatically if your connection drops.</p>
        <input ref={input} type="file" accept=".zip,application/zip" multiple className="visually-hidden" id="file-input" data-testid="file-input" onChange={(e) => e.target.files && start(e.target.files)} />
        <button className="btn btn-primary" onClick={() => input.current?.click()}>
          Choose files
        </button>
        {demo ? (
          <div className="stack" style={{ marginTop: 18 }}>
            <p className="small muted" style={{ margin: 0 }}>
              Demo: upload the synthetic export for this partner
            </p>
            <div className="row" style={{ justifyContent: "center" }}>
              {role === "partner_a" ? (
                <button className="btn btn-secondary btn-sm" onClick={() => sample("instagram")} data-testid="sample-instagram">
                  Use Aino&apos;s Instagram export
                </button>
              ) : (
                <button className="btn btn-secondary btn-sm" onClick={() => sample("google_photos")} data-testid="sample-google">
                  Use Sam&apos;s Google Takeout
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => sample("unknown")}>
                Try an unrecognised zip
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {notice ? <div className="alert alert-danger" role="alert">{notice}</div> : null}

      <section className="stack" aria-labelledby="mine-h" aria-live="polite">
        <div className="row-between">
          <h2 id="mine-h" style={{ margin: 0 }}>
            Your uploads
          </h2>
          {anyDone || processing ? (
            <Link className="btn btn-primary btn-sm" href="/partner/processing">
              {processing ? "Watch processing" : "Review your memories"}
            </Link>
          ) : null}
        </div>
        {local
          .filter((l) => l.state !== "done")
          .map((l) => (
            <div key={l.key} className="card flat upload-row">
              <strong>{l.name}</strong>
              <span className="muted small">{l.state === "error" ? "Failed" : `${fmtBytes(l.sent)} of ${fmtBytes(l.total)}`}</span>
              {l.state === "error" ? <p className="alert alert-danger" style={{ gridColumn: "1 / -1", margin: 0 }}>{l.error}</p> : <Progress value={l.sent} total={l.total} label={`Uploading ${l.name}`} />}
            </div>
          ))}
        {rows.length === 0 && !local.length ? <p className="muted">Nothing uploaded yet.</p> : null}
        {rows.map((u) => (
          <article key={u.id} className="card flat stack" style={{ borderColor: u.status === "failed" ? "#f3c7ca" : undefined }}>
            <div className="row-between">
              <div className="row">
                <strong>{u.name ?? "export.zip"}</strong>
                <span className="badge">{PLATFORM_NAME[u.platform]}</span>
              </div>
              <span className={u.status === "failed" ? "badge badge-danger" : u.status === "raw_deleted" ? "badge badge-sage" : "badge badge-info"}>{STATUS[u.status]}</span>
            </div>
            {u.status === "failed" ? (
              <p className="alert alert-danger" style={{ margin: 0 }}>
                {u.error}
              </p>
            ) : (
              <div className="kv">
                <span>{fmtBytes(u.bytes)}</span>
                <span>{u.stats.files_found ?? 0} files found</span>
                <span>{u.stats.photos_queued ?? 0} photos queued</span>
                <span>{u.stats.texts_found ?? 0} captions/posts</span>
                {u.stats.videos_skipped ? <span>{u.stats.videos_skipped} videos skipped</span> : null}
                {u.stats.unsupported_skipped || u.stats.skipped_unreadable ? <span>{(u.stats.unsupported_skipped ?? 0) + (u.stats.skipped_unreadable ?? 0)} unsupported format</span> : null}
                {u.stats.skipped_duplicate ? <span>{u.stats.skipped_duplicate} duplicates</span> : null}
                {u.stats.skipped_too_small ? <span>{u.stats.skipped_too_small} too small</span> : null}
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
