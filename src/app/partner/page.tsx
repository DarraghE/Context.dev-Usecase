import { redirect } from "next/navigation";
import { loadViewer } from "@/lib/viewer";
import { hasActiveConsent } from "@/privacy/consent";

export default async function PartnerHome() {
  const viewer = (await loadViewer())!;
  redirect((await hasActiveConsent(viewer.person.id)) ? "/partner/upload" : "/partner/consent");
}
