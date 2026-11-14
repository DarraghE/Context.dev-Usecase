import { DietBanner } from "@/components/DietBanner";
import { MenuBuilder } from "@/components/MenuBuilder";
import { PageHead, formatDay } from "@/components/ui";
import { loadViewer } from "@/lib/viewer";

export const metadata = { title: "Menu builder" };

export default async function MenuPage() {
  const viewer = (await loadViewer())!;
  const b = viewer.booking!;
  return (
    <div className="stack-lg">
      <PageHead eyebrow={`${b.coupleDisplayName} · ${formatDay(b.weddingDate)}`} title="Menu builder">
        A five-course draft built from the approved memories. Every course cites the memories it draws on and is checked in code against the stated allergies.
      </PageHead>
      <DietBanner d={b.dietaryConstraints} />
      <MenuBuilder allergies={b.dietaryConstraints.allergies} />
    </div>
  );
}
