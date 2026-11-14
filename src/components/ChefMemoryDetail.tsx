"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChefMemoryCard, type ChefMemory } from "./ChefOverview";
import { ENRICH_STATUS_LABEL, formatWhen } from "./ui";

/** §11.7 Chef › Memory card, with the full current menu Context.dev extracted. */
export function ChefMemoryDetail({ id }: { id: string }) {
  const [m, setM] = useState<ChefMemory | null | undefined>(undefined);
  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/chef/memories/${id}`, { cache: "no-store" });
      setM(r.ok ? (await r.json()).memory : null);
    })();
  }, [id]);
  if (m === undefined) return <p className="row muted"><span className="spinner" aria-hidden="true" /> Loading…</p>;
  if (m === null)
    return (
      <div className="card empty">
        <h1>Not available</h1>
        <p>This memory isn&apos;t approved for the chef.</p>
        <Link href="/chef">Back to memories</Link>
      </div>
    );
  const e = m.enrichment;
  return (
    <div className="stack-lg">
      <div className="row">
        <Link href="/chef">← All memories</Link>
      </div>
      <ChefMemoryCard m={m} />
      {e ? (
        <section className="card stack" aria-labelledby="menu-h">
          <div className="row-between">
            <h2 id="menu-h" style={{ margin: 0 }}>
              {e.restaurant_name ?? m.place?.name}: current menu
            </h2>
            <span className="badge badge-info">{ENRICH_STATUS_LABEL[e.status]}</span>
          </div>
          <p className="muted small">
            Extracted by Context.dev from the restaurant&apos;s public website on {formatWhen(e.scraped_at)}. This is today&apos;s menu, which may differ from the menu on the day of the memory.
          </p>
          {e.menu_sections?.length ? (
            <div className="grid-2">
              {e.menu_sections.map((s) => (
                <div key={s.section} className="card flat">
                  <h3 style={{ textTransform: "capitalize" }}>{s.section.toLowerCase()}</h3>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack">
                    {s.items.map((i) => {
                      const hit = e.match?.item_name === i.name;
                      return (
                        <li key={i.name} style={hit ? { background: "var(--brand-soft)", borderRadius: 8, padding: 8 } : undefined}>
                          <div className="row-between">
                            <strong>{i.name}</strong>
                            <span className="muted small">{i.price ?? ""}</span>
                          </div>
                          {i.description ? <div className="small muted">{i.description}</div> : null}
                          {i.dietary_tags?.length ? <div className="small">{i.dietary_tags.join(" · ")}</div> : null}
                          {hit ? <span className="badge badge-brand" style={{ marginTop: 4 }}>The couple&apos;s dish</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="alert alert-info">{e.note ?? "No menu text could be extracted."}</p>
          )}
          {e.dish_photos?.length ? (
            <div>
              <h3>From the venue&apos;s website</h3>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                {e.dish_photos.map((u) => (
                  // Public venue photos found by Context.dev image classification.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="" referrerPolicy="no-referrer" loading="lazy" style={{ borderRadius: 10, aspectRatio: "4/3", objectFit: "cover", width: "100%" }} />
                ))}
              </div>
            </div>
          ) : null}
          {e.pages?.length ? (
            <details>
              <summary className="small">Pages Context.dev read</summary>
              <ul className="small">
                {e.pages.map((p) => (
                  <li key={p.url}>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {p.url}
                    </a>{" "}
                    — {p.items} items ({p.status})
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : (
        <div className="card soft">
          <p className="muted" style={{ margin: 0 }}>
            No restaurant for this memory (home-cooked, or the venue couldn&apos;t be identified).
          </p>
        </div>
      )}
    </div>
  );
}
