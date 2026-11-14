import type { ReactNode } from "react";

export function PageHead({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head row-between">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {children ? <div className="muted">{children}</div> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function Progress({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const done = total > 0 && value >= total;
  return (
    <div className={`progress${done ? " done" : ""}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={value}>
      <span style={{ width: `${total === 0 ? 0 : pct}%` }} />
    </div>
  );
}

export const EVENT_ICON: Record<string, string> = {
  proposal: "💍",
  engagement_celebration: "🥂",
  first_date: "❤️",
  anniversary: "🕯️",
  birthday: "🎂",
  trip: "✈️",
  holiday_celebration: "🎉",
  family_gathering: "🏡",
  everyday: "🍽️",
  other: "🍽️",
};

export function EventBadge({ type, label }: { type: string; label: string }) {
  return (
    <span className={`badge event-${type}`}>
      <span aria-hidden="true">{EVENT_ICON[type] ?? "🍽️"}</span>
      {label}
    </span>
  );
}

export function formatDay(d: string | null | undefined): string {
  if (!d) return "Date unknown";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(iso)) + " UTC";
}

export const ENRICH_STATUS_LABEL: Record<string, string> = {
  ok: "Menu found",
  no_menu: "No menu text on the website",
  menu_is_image: "Menu is an image or QR code",
  no_website: "No official website found",
  error: "Couldn't read the website",
};
