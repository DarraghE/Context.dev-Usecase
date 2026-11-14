import Link from "next/link";
import { config } from "@/config";
import { Uploader } from "@/components/Uploader";
import { PageHead } from "@/components/ui";
import { loadViewer } from "@/lib/viewer";
import { hasActiveConsent } from "@/privacy/consent";

export const metadata = { title: "Upload your exports" };

export default async function UploadPage() {
  const viewer = (await loadViewer())!;
  const consented = await hasActiveConsent(viewer.person.id);
  if (!consented) {
    return (
      <div className="card empty">
        <h1>Consent first</h1>
        <p>Uploads stay locked until you have read and agreed to how your data is used.</p>
        <Link className="btn btn-primary" href="/partner/consent">
          Read and consent
        </Link>
      </div>
    );
  }
  return (
    <div className="stack-lg">
      <PageHead
        eyebrow="Step 2 of 4"
        title="Upload your exports"
        actions={
          <Link className="btn btn-secondary" href="/partner/processing">
            See processing
          </Link>
        }
      >
        Download your data from each platform, then drop the .zip files here exactly as you received them. Platforms can take hours to prepare an export — request yours early.
      </PageHead>
      <Uploader demo={config.demoMode} role={viewer.session.role} />
    </div>
  );
}
