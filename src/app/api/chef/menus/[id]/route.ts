import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBooking } from "@/lib/access";
import { handler, requireSession } from "@/lib/http";
import { saveChefEdit } from "@/menu/generate";

const CourseZ = z.object({
  position: z.number().int(),
  course: z.string().max(40),
  title: z.string().max(200),
  description: z.string().max(2000),
  story_for_menu_card: z.string().max(300),
  memory_ids: z.array(z.string()).max(20),
  allergens: z.array(z.string().max(40)).max(20),
  dietary_variants: z.array(z.object({ for: z.string().max(60), change: z.string().max(400) })).max(20),
  seasonality_note: z.string().max(400),
  structural: z.boolean().optional(),
  suggested_ingredients: z.array(z.string().max(80)).max(12).optional(),
  flagged_for_chef: z.string().nullish(),
});

/** PATCH /api/chef/menus/:id — save the chef's edits / reordering as a new version (US-7 AC5). */
export const PATCH = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireSession();
  const bookingId = requireBooking(s);
  const { id } = await ctx.params;
  const { courses } = z.object({ courses: z.array(CourseZ).min(1).max(12) }).parse(await req.json());
  const row = await saveChefEdit(bookingId, id, courses, s.personId);
  return NextResponse.json({ menu: row });
});
