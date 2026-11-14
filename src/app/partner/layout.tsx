import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { loadViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/?signin=required");
  if (viewer.booking?.status === "deleted") {
    return (
      <AppShell viewer={viewer}>
        <div className="card empty">
          <h1>This booking has been deleted</h1>
          <p>All data for this wedding was removed.</p>
        </div>
      </AppShell>
    );
  }
  return <AppShell viewer={viewer}>{children}</AppShell>;
}
