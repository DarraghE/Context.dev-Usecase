import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { loadViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function CatererLayout({ children }: { children: React.ReactNode }) {
  const viewer = await loadViewer();
  if (!viewer) redirect("/?signin=required");
  return <AppShell viewer={viewer}>{children}</AppShell>;
}
