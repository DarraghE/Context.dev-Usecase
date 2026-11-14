import { ProcessingView } from "@/components/ProcessingView";
import { loadViewer } from "@/lib/viewer";

export const metadata = { title: "Processing" };

export default async function ProcessingPage() {
  const viewer = (await loadViewer())!;
  return <ProcessingView bookingId={viewer.booking!.id} />;
}
