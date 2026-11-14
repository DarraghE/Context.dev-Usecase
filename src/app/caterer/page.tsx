import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bookings } from "@/db/schema";
import { PageHead, formatDay } from "@/components/ui";
import { loadViewer } from "@/lib/viewer";

export const metadata = { title: "Bookings" };

const STATUS: Record<string, { label: string; cls: string }> = {
  invited: { label: "Invited", cls: "badge" },
  collecting: { label: "Collecting exports", cls: "badge badge-info" },
  reviewing: { label: "Couple reviewing", cls: "badge badge-amber" },
  chef_ready: { label: "Ready for chef", cls: "badge badge-sage" },
  deleted: { label: "Deleted", cls: "badge badge-danger" },
};

export default async function CatererHome() {
  const viewer = (await loadViewer())!;
  const rows = viewer.person.catererId ? await getDb().select().from(bookings).where(eq(bookings.catererId, viewer.person.catererId)).orderBy(desc(bookings.createdAt)) : [];
  return (
    <div className="stack-lg">
      <PageHead
        eyebrow={viewer.caterer?.name}
        title="Wedding Food Memory bookings"
        actions={
          <Link className="btn btn-primary" href="/caterer/bookings/new">
            New booking
          </Link>
        }
      >
        Add the food-memory add-on to a wedding package, then send each partner and the chef their personal link. You see progress counts only.
      </PageHead>
      {rows.length === 0 ? (
        <div className="card empty">
          <h2>No bookings yet</h2>
          <p>Create the first booking to invite a couple.</p>
          <Link className="btn btn-primary" href="/caterer/bookings/new">
            New booking
          </Link>
        </div>
      ) : (
        <div className="card flat table-wrap">
          <table className="simple">
            <thead>
              <tr>
                <th scope="col">Couple</th>
                <th scope="col">Wedding</th>
                <th scope="col">Status</th>
                <th scope="col">Auto-delete after</th>
                <th scope="col">
                  <span className="visually-hidden">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 650 }}>{b.coupleDisplayName}</td>
                  <td>{formatDay(b.weddingDate)}</td>
                  <td>
                    <span className={STATUS[b.status]?.cls}>{STATUS[b.status]?.label}</span>
                  </td>
                  <td>{formatDay(b.deleteAfter)}</td>
                  <td>
                    <Link href={`/caterer/bookings/${b.id}`}>Status</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
