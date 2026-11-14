import { ENRICH_STATUS_LABEL, formatWhen } from "./ui";

export type EnrichmentView = {
  provider: string;
  status: string;
  source_url: string | null;
  scraped_at: string;
  label: string;
  restaurant_name: string | null;
  logo_url: string | null;
  dish_photos: string[];
  note: string | null;
  item_count: number;
  match: { item_name: string; description: string | null; price: string | null; confidence: number; source_url: string } | null;
};

/** The Context.dev part of a memory card: menu match, source link and scrape date ("current menu"). */
export function EnrichmentPanel({ e, place }: { e: EnrichmentView | null; place: { name: string } | null }) {
  if (!e) return null;
  return (
    <div className="enrich" data-testid="enrichment">
      <div className="head">
        {e.logo_url ? (
          // Public logo from the venue's website, found by Context.dev image classification.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="logo" src={e.logo_url} alt="" referrerPolicy="no-referrer" loading="lazy" />
        ) : null}
        <div>
          <div style={{ fontWeight: 650 }}>{e.restaurant_name ?? place?.name ?? "Restaurant"}</div>
          <div className="via">
            {ENRICH_STATUS_LABEL[e.status] ?? e.status}
            {e.status === "ok" ? ` · ${e.item_count} items on the current menu` : ""}
          </div>
        </div>
      </div>
      {e.match ? (
        <div>
          <div className="match">
            On the menu: “{e.match.item_name}”{e.match.price ? ` · price ${e.match.price}` : ""}
          </div>
          {e.match.description ? <div className="muted small">{e.match.description}</div> : null}
          <div className="via">Match confidence {Math.round(e.match.confidence * 100)}%</div>
        </div>
      ) : e.status === "ok" ? (
        <div className="muted small">The dish isn&apos;t on today&apos;s menu — the restaurant&apos;s current dishes are still available to the chef.</div>
      ) : e.note ? (
        <div className="muted small">{e.note}</div>
      ) : null}
      <div className="via" style={{ marginTop: 6 }}>
        {e.source_url ? (
          <>
            Source:{" "}
            <a href={e.source_url} target="_blank" rel="noreferrer">
              {e.source_url.replace(/^https?:\/\//, "")}
            </a>{" "}
            ·{" "}
          </>
        ) : null}
        {e.label}, read {formatWhen(e.scraped_at)} via Context.dev
      </div>
    </div>
  );
}
