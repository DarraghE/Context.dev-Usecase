import type { DietaryConstraints } from "@/db/schema";

/** US-7 AC3: the booking's dietary constraints, always at the top of the chef's screens. */
export function DietBanner({ d }: { d: DietaryConstraints }) {
  const diets = Object.entries(d.diets ?? {}).filter(([, n]) => n > 0);
  return (
    <section className="diet-banner" aria-label="Dietary constraints">
      <span aria-hidden="true" style={{ fontSize: "1.3rem" }}>
        ⚠️
      </span>
      <div>
        <strong>Dietary constraints for this wedding: </strong>
        {d.allergies.length ? (
          <>
            Allergies: <strong>{d.allergies.join(", ")}</strong>.{" "}
          </>
        ) : (
          "No allergies stated. "
        )}
        {diets.length ? <>Diets: {diets.map(([k, n]) => `${n} ${k.replace(/_/g, "-")}`).join(", ")}. </> : null}
        {d.notes ? <span className="small">{d.notes}</span> : null}
      </div>
    </section>
  );
}
