import { config } from "@/config";
import { NewBookingForm } from "@/components/NewBookingForm";
import { PageHead } from "@/components/ui";

export const metadata = { title: "New booking" };

export default function NewBooking() {
  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <PageHead eyebrow="Caterer" title="New booking">
        The couple and the chef each get a single-use personal link. In this prototype the links are shown here instead of being emailed.
      </PageHead>
      <NewBookingForm demo={config.demoMode} />
    </div>
  );
}
