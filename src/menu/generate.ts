import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { config } from "@/config";
import { getDb } from "@/db/client";
import { bookings, memories, menus, moments, places, type Course } from "@/db/schema";
import { structured } from "@/integrations/claude";
import { getReplay, ReplayMissingError } from "@/integrations/replay";
import { arr, bool, num, obj, str } from "@/integrations/schema";
import { audit } from "@/lib/audit";
import { newId, nowIso } from "@/lib/ids";
import { loadPrompt } from "@/prompts";
import { validateCourse, validateMenu } from "./allergens";

export const COURSE_STRUCTURE = ["amuse", "starter", "main", "pre-dessert", "dessert"] as const;

const COURSE_SCHEMA = obj({
  position: num(),
  course: str(),
  title: str(),
  description: str(),
  story_for_menu_card: str(),
  memory_ids: arr(str()),
  structural: bool(),
  allergens: arr(str()),
  dietary_variants: arr(obj({ for: str(), change: str() })),
  seasonality_note: str(),
  suggested_ingredients: arr(str()),
});
const MENU_SCHEMA = obj({ courses: arr(COURSE_SCHEMA), unused_memories_worth_considering: arr(str()) });

const CourseZ = z.object({
  position: z.number().int(),
  course: z.string(),
  title: z.string(),
  description: z.string(),
  story_for_menu_card: z.string(),
  memory_ids: z.array(z.string()),
  structural: z.boolean().default(false),
  allergens: z.array(z.string()),
  dietary_variants: z.array(z.object({ for: z.string(), change: z.string() })),
  seasonality_note: z.string(),
  suggested_ingredients: z.array(z.string()).default([]),
});
const MenuZ = z.object({ courses: z.array(CourseZ), unused_memories_worth_considering: z.array(z.string()).default([]) });
export type MenuDraft = z.infer<typeof MenuZ>;

function season(date: string, lat = 60): string {
  const m = Number(date.slice(5, 7));
  const north = lat >= 0;
  const s = m <= 2 || m === 12 ? "winter" : m <= 5 ? "spring" : m <= 8 ? "summer" : "autumn";
  if (north) return s;
  return { winter: "summer", spring: "autumn", summer: "winter", autumn: "spring" }[s]!;
}

/** The chef-safe input: approved memories only, no flags, no person data. */
export async function menuInput(bookingId: string) {
  const db = getDb();
  const booking = (await db.select().from(bookings).where(eq(bookings.id, bookingId)))[0]!;
  const mems = await db
    .select()
    .from(memories)
    .where(and(eq(memories.bookingId, bookingId), eq(memories.status, "approved")))
    .orderBy(desc(memories.significance));
  const ms = new Map((await db.select().from(moments).where(eq(moments.bookingId, bookingId))).map((m) => [m.id, m]));
  const ps = new Map((await db.select().from(places)).map((p) => [p.id, p]));
  return {
    booking,
    memories: mems.map((m) => {
      const mo = ms.get(m.momentId);
      const place = mo?.placeId ? ps.get(mo.placeId) : undefined;
      return {
        id: m.id,
        dish_key: m.dishKey,
        dish: m.dishName,
        dish_description: m.dishDescription,
        event: mo?.eventType ?? "other",
        date: mo?.localDate ?? null,
        place: place?.name ?? null,
        couple_note: m.coupleNote,
        significance: m.significance,
        menu_item_match: m.menuItemMatch ? { item: m.menuItemMatch.item_name, description: m.menuItemMatch.item_description } : null,
      };
    }),
    constraints: booking.dietaryConstraints,
    season: season(booking.weddingDate),
  };
}

/**
 * Replay recordings cite memories by dish_key (memory ids change per run); they are mapped
 * onto the currently approved memories and unapproved citations are dropped.
 */
function fromReplay(raw: MenuDraft, mems: { id: string; dish_key: string }[]): MenuDraft {
  const byKey = new Map(mems.map((m) => [m.dish_key, m.id]));
  const map = (ids: string[]) => ids.map((k) => byKey.get(k)).filter((x): x is string => !!x);
  return {
    courses: raw.courses.map((c) => {
      const ids = map(c.memory_ids);
      return { ...c, memory_ids: ids, structural: ids.length === 0 ? true : c.structural };
    }),
    unused_memories_worth_considering: map(raw.unused_memories_worth_considering),
  };
}

async function callMenu(input: Awaited<ReturnType<typeof menuInput>>, bookingId: string): Promise<MenuDraft> {
  if (config.demoReplay) {
    const entry = getReplay<{ output: unknown }>("claude/menu_generate", "default");
    if (!entry) throw new ReplayMissingError("claude/menu_generate", "default");
    return fromReplay(MenuZ.parse(entry.output), input.memories);
  }
  return structured({
    stage: "menu_generate",
    model: config.models.menu,
    effort: config.effort.menu,
    prompt: loadPrompt("menu_generate"),
    content: [
      {
        type: "text",
        text: JSON.stringify({
          wedding_date: input.booking.weddingDate,
          season: input.season,
          course_structure: COURSE_STRUCTURE.map((c, i) => ({ position: i + 1, course: c })),
          dietary_constraints: input.constraints,
          approved_memories: input.memories.map(({ dish_key: _k, ...m }) => m),
        }),
      },
    ],
    schema: MENU_SCHEMA,
    validate: MenuZ,
    replayKey: "default",
    stream: true,
    bookingId,
  });
}

async function callCourse(input: Awaited<ReturnType<typeof menuInput>>, current: Course[], position: number, problem: string | null, bookingId: string): Promise<Course> {
  const target = current.find((c) => c.position === position)!;
  if (config.demoReplay) {
    const entry = getReplay<{ output: unknown }>("claude/menu_course", `${target.course}`) ?? getReplay<{ output: unknown }>("claude/menu_course", "default");
    if (!entry) throw new ReplayMissingError("claude/menu_course", target.course);
    const c = CourseZ.parse(entry.output);
    const mapped = fromReplay({ courses: [c], unused_memories_worth_considering: [] }, input.memories).courses[0]!;
    return { ...mapped, position, course: target.course };
  }
  const c = await structured({
    stage: "menu_course",
    model: config.models.menu,
    effort: config.effort.menu,
    prompt: loadPrompt("menu_course"),
    content: [
      {
        type: "text",
        text: JSON.stringify({
          wedding_date: input.booking.weddingDate,
          season: input.season,
          dietary_constraints: input.constraints,
          approved_memories: input.memories.map(({ dish_key: _k, ...m }) => m),
          current_menu: current,
          rewrite: { position, course: target.course },
          problem_to_fix: problem,
        }),
      },
    ],
    schema: COURSE_SCHEMA,
    validate: CourseZ,
    replayKey: `${target.course}`,
    stream: true,
    bookingId,
  });
  return { ...c, position, course: target.course };
}

/** Code checks every course; a failing course is regenerated once, then flagged for the chef. */
async function enforceConstraints(input: Awaited<ReturnType<typeof menuInput>>, draft: MenuDraft, bookingId: string) {
  const allergies = input.constraints.allergies ?? [];
  const approved = new Set(input.memories.map((m) => m.id));
  const regenerated: number[] = [];
  const flagged: number[] = [];
  let courses: Course[] = draft.courses.map((c) => ({ ...c, memory_ids: c.memory_ids.filter((id) => approved.has(id)), flagged_for_chef: null }));
  courses = courses.map((c) => ({ ...c, structural: c.memory_ids.length === 0 }));

  for (const v of validateMenu(courses, allergies)) {
    if (regenerated.includes(v.position)) continue;
    regenerated.push(v.position);
    const problem = `Course ${v.position} contains ${v.allergen} but a guest has "${v.allergy}" and no variant removes it.`;
    try {
      const fresh = await callCourse(input, courses, v.position, problem, bookingId);
      courses = courses.map((c) => (c.position === v.position ? { ...fresh, memory_ids: fresh.memory_ids.filter((id) => approved.has(id)), flagged_for_chef: null } : c));
    } catch {
      /* keep the original and flag below */
    }
  }
  courses = courses.map((c) => {
    const still = validateCourse(c, allergies);
    if (still.length) {
      flagged.push(c.position);
      return { ...c, flagged_for_chef: still.map((s) => `Contains ${s.allergen} (guest allergy: ${s.allergy}) with no safe variant`).join("; ") };
    }
    return { ...c, structural: c.memory_ids.length === 0 };
  });
  return { courses, regenerated, flagged };
}

async function nextVersion(bookingId: string): Promise<number> {
  const last = await getDb().select({ v: menus.version }).from(menus).where(eq(menus.bookingId, bookingId)).orderBy(desc(menus.version)).limit(1);
  return (last[0]?.v ?? 0) + 1;
}

/** US-7 AC4: generate a five-course draft citing memory ids, validated against allergies. */
export async function generateMenu(bookingId: string, actor: string) {
  const input = await menuInput(bookingId);
  if (!input.memories.length) throw new Error("No approved memories yet. The couple needs to approve at least one memory.");
  const draft = await callMenu(input, bookingId);
  const { courses, regenerated, flagged } = await enforceConstraints(input, draft, bookingId);
  const row = {
    id: newId(),
    bookingId,
    version: await nextVersion(bookingId),
    courses: { courses: courses.sort((a, b) => a.position - b.position), unused_memories_worth_considering: draft.unused_memories_worth_considering.filter((id) => input.memories.some((m) => m.id === id)) },
    createdBy: "system" as const,
    model: config.demoReplay ? `${config.models.menu} (replay)` : config.models.menu,
    promptVersion: loadPrompt("menu_generate").key,
    validation: { regenerated, flagged },
    createdAt: nowIso(),
  };
  await getDb().insert(menus).values(row);
  await audit({ actor, action: "menu.generated", bookingId, targetType: "menu", targetId: row.id, detail: { version: row.version, courses: courses.length, regenerated, flagged } });
  return row;
}

/** US-7 AC5: regenerate a single course into a new version. */
export async function regenerateCourse(bookingId: string, menuId: string, position: number, instruction: string | null, actor: string) {
  const db = getDb();
  const base = (await db.select().from(menus).where(and(eq(menus.id, menuId), eq(menus.bookingId, bookingId))))[0];
  if (!base) throw new Error("menu not found");
  const input = await menuInput(bookingId);
  const current = base.courses.courses;
  if (!current.some((c) => c.position === position)) throw new Error("no such course");
  let fresh = await callCourse(input, current, position, instruction, bookingId);
  const approved = new Set(input.memories.map((m) => m.id));
  fresh = { ...fresh, memory_ids: fresh.memory_ids.filter((id) => approved.has(id)), flagged_for_chef: null };
  let regenerated: number[] = [];
  if (validateCourse(fresh, input.constraints.allergies).length) {
    regenerated = [position];
    try {
      fresh = await callCourse(input, current.map((c) => (c.position === position ? fresh : c)), position, "The previous attempt broke a stated allergy. Fix it.", bookingId);
    } catch {
      /* flagged below */
    }
  }
  const still = validateCourse(fresh, input.constraints.allergies);
  fresh = { ...fresh, structural: fresh.memory_ids.length === 0, flagged_for_chef: still.length ? still.map((s) => `Contains ${s.allergen} (guest allergy: ${s.allergy}) with no safe variant`).join("; ") : null };
  const row = {
    id: newId(),
    bookingId,
    version: await nextVersion(bookingId),
    courses: { courses: current.map((c) => (c.position === position ? fresh : c)), unused_memories_worth_considering: base.courses.unused_memories_worth_considering },
    createdBy: "system" as const,
    model: config.demoReplay ? `${config.models.menu} (replay)` : config.models.menu,
    promptVersion: loadPrompt("menu_course").key,
    validation: { regenerated, flagged: still.length ? [position] : [] },
    createdAt: nowIso(),
  };
  await db.insert(menus).values(row);
  await audit({ actor, action: "menu.course_regenerated", bookingId, targetType: "menu", targetId: row.id, detail: { version: row.version, position } });
  return row;
}

/** US-7 AC5: chef edits / reorders are saved as a new version, re-validated. */
export async function saveChefEdit(bookingId: string, menuId: string, courses: Course[], actor: string) {
  const db = getDb();
  const base = (await db.select().from(menus).where(and(eq(menus.id, menuId), eq(menus.bookingId, bookingId))))[0];
  if (!base) throw new Error("menu not found");
  const input = await menuInput(bookingId);
  const approved = new Set(input.memories.map((m) => m.id));
  const cleaned = courses.map((c, i) => {
    const ids = c.memory_ids.filter((id) => approved.has(id));
    const v = validateCourse({ ...c, memory_ids: ids }, input.constraints.allergies);
    return { ...c, position: i + 1, memory_ids: ids, structural: ids.length === 0, flagged_for_chef: v.length ? v.map((s) => `Contains ${s.allergen} (guest allergy: ${s.allergy}) with no safe variant`).join("; ") : null };
  });
  const row = {
    id: newId(),
    bookingId,
    version: await nextVersion(bookingId),
    courses: { courses: cleaned, unused_memories_worth_considering: base.courses.unused_memories_worth_considering },
    createdBy: "chef" as const,
    model: null,
    promptVersion: null,
    validation: { regenerated: [], flagged: cleaned.filter((c) => c.flagged_for_chef).map((c) => c.position) },
    createdAt: nowIso(),
  };
  await db.insert(menus).values(row);
  await audit({ actor, action: "menu.saved", bookingId, targetType: "menu", targetId: row.id, detail: { version: row.version } });
  return row;
}

