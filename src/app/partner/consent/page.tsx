import { ConsentForm } from "@/components/ConsentForm";

export const metadata = { title: "Consent" };

export default function ConsentPage() {
  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <ConsentForm />
    </div>
  );
}
