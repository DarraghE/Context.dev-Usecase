import Link from "next/link";
import { ChefOverview } from "@/components/ChefOverview";
import { DietBanner } from "@/components/DietBanner";
import { PageHead, formatDay } from "@/components/ui";
import { loadViewer } from "@/lib/viewer";

export const metadata = { title: "Food memories" };

export default async function ChefHome() {
  const viewer = (await loadViewer())!;
  const b = viewer.booking!;
  return (
    <div className="stack-lg">
      <PageHead
        eyebrow={`Wedding ${formatDay(b.weddingDate)}`}
        title={`${b.coupleDisplayName}: their food story`}
        actions={
          <Link className="btn btn-primary" href="/chef/menu">
            Open menu builder
          </Link>
        }
      >
        Memories the couple approved for you, with the real dish from each restaurant&apos;s current menu where Context.dev could find it.
      </PageHead>
      <DietBanner d={b.dietaryConstraints} />
      <ChefOverview />
    </div>
  );
}
