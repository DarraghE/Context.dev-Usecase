import { and, eq, inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { memories, type Course } from "@/db/schema";
import { reviewAction } from "@/lib/memories";
import { canonicalAllergens, validateCourse } from "@/menu/allergens";
import { generateMenu, regenerateCourse, saveChefEdit } from "@/menu/generate";
import { demoBooking } from "./helpers";

const base: Course = {
  position: 1,
  course: "dessert",
  title: "Strawberries",
  description: "Strawberries and cream",
  story_for_menu_card: "",
  memory_ids: [],
  allergens: ["milk"],
  dietary_variants: [],
  seasonality_note: "",
};

describe("allergen validation in code (§7.9)", () => {
  it("maps booking allergies to canonical allergens", () => {
    expect(canonicalAllergens("nut allergy")).toEqual(["nuts"]);
    expect(canonicalAllergens("peanuts")).toContain("peanuts");
    expect(canonicalAllergens("coeliac")).toEqual(["gluten"]);
    expect(canonicalAllergens("shellfish")).toEqual(expect.arrayContaining(["crustaceans", "molluscs"]));
  });
  it("catches allergens hidden in the description, not only the list", () => {
    expect(validateCourse({ ...base, description: "with a pistachio crumb" }, ["nut allergy"])).toHaveLength(1);
    expect(validateCourse({ ...base, description: "with coconut and nutmeg" }, ["nut allergy"])).toHaveLength(0);
  });
  it("accepts a course whose variant removes the allergen", () => {
    expect(validateCourse({ ...base, allergens: ["nuts"], dietary_variants: [{ for: "nut allergy", change: "toasted oats instead" }] }, ["nut allergy"])).toHaveLength(0);
  });
});

describe("menu generation (US-7 AC4/AC5)", () => {
  let bk: Awaited<ReturnType<typeof demoBooking>>;
  beforeAll(async () => {
    bk = await demoBooking();
    const want = ["Eton mess", "Salmon soup", "Rye bread", "Pizza marinara", "Pizza margherita", "Pizza a portafoglio", "Blueberry pie"];
    const ms = await getDb().select().from(memories).where(and(eq(memories.bookingId, bk.bookingId), inArray(memories.dishName, want)));
    for (const m of ms) await reviewAction(m.personId, m.id, { type: "approve" });
  });

  it("drafts five courses citing approved memories, with no unhandled nut allergen", async () => {
    const row = await generateMenu(bk.bookingId, bk.chef);
    const courses = row.courses.courses;
    expect(courses.map((c) => c.course)).toEqual(["amuse", "starter", "main", "pre-dessert", "dessert"]);
    const approved = new Set((await getDb().select().from(memories).where(and(eq(memories.bookingId, bk.bookingId), eq(memories.status, "approved")))).map((m) => m.id));
    for (const c of courses) {
      expect(c.memory_ids.length > 0 || c.structural).toBe(true);
      for (const id of c.memory_ids) expect(approved.has(id)).toBe(true);
      expect(validateCourse(c, ["nut allergy"])).toEqual([]);
    }
    // The recorded draft had a pistachio pre-dessert: code caught it and regenerated once.
    expect(row.validation?.regenerated).toEqual([4]);
    expect(row.validation?.flagged).toEqual([]);
    const dessert = courses.find((c) => c.course === "dessert")!;
    const eton = (await getDb().select().from(memories).where(and(eq(memories.bookingId, bk.bookingId), eq(memories.dishName, "Eton mess"))))[0]!;
    expect(dessert.memory_ids).toContain(eton.id);
    expect(dessert.dietary_variants.some((v) => /vegan/i.test(v.for))).toBe(true);
  });

  it("regenerates one course into a new version and saves chef edits as versions", async () => {
    const v1 = await generateMenu(bk.bookingId, bk.chef);
    const v2 = await regenerateCourse(bk.bookingId, v1.id, 5, "lighter", bk.chef);
    expect(v2.version).toBe(v1.version + 1);
    expect(v2.courses.courses[4]!.title).not.toBe(v1.courses.courses[4]!.title);
    expect(v2.courses.courses.slice(0, 4)).toEqual(v1.courses.courses.slice(0, 4));
    const reordered = [...v2.courses.courses].reverse();
    const v3 = await saveChefEdit(bk.bookingId, v2.id, reordered, bk.chef);
    expect(v3.createdBy).toBe("chef");
    expect(v3.courses.courses[0]!.course).toBe("dessert");
    expect(v3.courses.courses.map((c) => c.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it("flags a chef edit that breaks an allergy", async () => {
    const v = await generateMenu(bk.bookingId, bk.chef);
    const bad = v.courses.courses.map((c, i) => (i === 0 ? { ...c, description: `${c.description} Finished with candied hazelnuts.` } : c));
    const saved = await saveChefEdit(bk.bookingId, v.id, bad, bk.chef);
    expect(saved.courses.courses[0]!.flagged_for_chef).toMatch(/nuts/);
    expect(saved.validation?.flagged).toEqual([1]);
  });
});
