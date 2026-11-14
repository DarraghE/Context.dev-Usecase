import type { Course } from "@/db/schema";

/**
 * Allergen validation in code (§7.9): a course must not list a booking allergen unless a
 * dietary variant removes it. We also scan the course text for allergen words the model
 * forgot to list, so a "pistachio crumb" cannot slip past a nut allergy.
 */
const SYNONYMS: Record<string, { canonical: string; words: RegExp }> = {
  nuts: { canonical: "nuts", words: /\b(nuts?|tree ?nuts?|almonds?|hazelnuts?|walnuts?|pecans?|pistachios?|cashews?|macadamias?|brazil nuts?|praline|marzipan|frangipane|gianduja|nougat|amaretti|nocciola|noci|mandorle|pistacchi[oa]?)\b/i },
  peanuts: { canonical: "peanuts", words: /\b(peanuts?|groundnuts?|peanut butter|satay)\b/i },
  milk: { canonical: "milk", words: /\b(milk|dairy|cream|butter|cheese|yog(h)?urt|mascarpone|ricotta|parmesan|mozzarella|burrata|crème|creme fraiche|ghee|whey|lactose)\b/i },
  eggs: { canonical: "eggs", words: /\b(eggs?|meringue|mayonnaise|aioli|custard|hollandaise|egg yolk)\b/i },
  gluten: { canonical: "gluten", words: /\b(gluten|wheat|flour|bread|brioche|pasta|pizza|barley|rye|spelt|semolina|couscous|breadcrumbs?|pastry|biscuit)\b/i },
  fish: { canonical: "fish", words: /\b(fish|salmon|trout|cod|tuna|anchov(y|ies)|herring|pike[- ]?perch|whitefish|roe)\b/i },
  crustaceans: { canonical: "crustaceans", words: /\b(shrimps?|prawns?|crab|lobster|langoustines?|crayfish|crustaceans?)\b/i },
  molluscs: { canonical: "molluscs", words: /\b(mussels?|oysters?|clams?|scallops?|squid|octopus|molluscs?)\b/i },
  sesame: { canonical: "sesame", words: /\b(sesame|tahini)\b/i },
  soybeans: { canonical: "soybeans", words: /\b(soy|soya|tofu|edamame|miso)\b/i },
  celery: { canonical: "celery", words: /\b(celery|celeriac)\b/i },
  mustard: { canonical: "mustard", words: /\b(mustard)\b/i },
  sulphites: { canonical: "sulphites", words: /\b(sulphites?|sulfites?)\b/i },
  lupin: { canonical: "lupin", words: /\b(lupin)\b/i },
};

/** Maps a booking allergy ("nut allergy", "tree nuts", "coeliac") to canonical allergens. */
export function canonicalAllergens(allergy: string): string[] {
  const a = allergy.toLowerCase();
  const out = new Set<string>();
  if (/peanut|groundnut/.test(a)) out.add("peanuts");
  if (/(^|[^a-z])(tree ?)?nuts?([^a-z]|$)|almond|hazelnut|walnut|pistachio|cashew|pecan/.test(a) && !/peanut|coconut|nutmeg/.test(a)) out.add("nuts");
  if (/^nut|nut allergy|nuts/.test(a) && !/peanut|coconut/.test(a)) out.add("nuts");
  if (/milk|dairy|lactose/.test(a)) out.add("milk");
  if (/egg/.test(a)) out.add("eggs");
  if (/gluten|wheat|coeliac|celiac/.test(a)) out.add("gluten");
  if (/fish/.test(a) && !/shellfish/.test(a)) out.add("fish");
  if (/shellfish|crustacean|shrimp|prawn|crab|lobster/.test(a)) out.add("crustaceans");
  if (/shellfish|mollusc|mussel|oyster|clam|squid/.test(a)) out.add("molluscs");
  if (/sesame/.test(a)) out.add("sesame");
  if (/soy/.test(a)) out.add("soybeans");
  if (/celery/.test(a)) out.add("celery");
  if (/mustard/.test(a)) out.add("mustard");
  if (/sulph|sulf/.test(a)) out.add("sulphites");
  if (/lupin/.test(a)) out.add("lupin");
  return [...out];
}

export function normaliseListed(allergen: string): string[] {
  const hits = Object.values(SYNONYMS).filter((s) => s.words.test(allergen) || s.canonical === allergen.toLowerCase());
  return hits.length ? hits.map((h) => h.canonical) : [allergen.toLowerCase()];
}

/** Allergens a course contains: what it lists plus what its text gives away. */
export function courseAllergens(c: Course): Set<string> {
  const listed = new Set(c.allergens.flatMap(normaliseListed));
  const text = `${c.title} ${c.description}`;
  for (const s of Object.values(SYNONYMS)) if (s.words.test(text)) listed.add(s.canonical);
  return listed;
}

/** True when some variant explicitly addresses this allergen (e.g. "for": "nut allergy"). */
function variantCovers(c: Course, allergen: string, bookingAllergy: string): boolean {
  return c.dietary_variants.some((v) => {
    const f = `${v.for} ${v.change}`.toLowerCase();
    return f.includes(bookingAllergy.toLowerCase()) || canonicalAllergens(v.for).includes(allergen) || new RegExp(`${allergen.replace(/s$/, "")}[- ]?free`).test(f);
  });
}

export type AllergenViolation = { position: number; allergen: string; allergy: string };

export function validateCourse(c: Course, allergies: string[]): AllergenViolation[] {
  const contains = courseAllergens(c);
  const out: AllergenViolation[] = [];
  for (const allergy of allergies) {
    for (const a of canonicalAllergens(allergy)) {
      if (contains.has(a) && !variantCovers(c, a, allergy)) out.push({ position: c.position, allergen: a, allergy });
    }
  }
  return out;
}

export function validateMenu(courses: Course[], allergies: string[]): AllergenViolation[] {
  return courses.flatMap((c) => validateCourse(c, allergies));
}
