import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, HttpError, requireSession } from "@/lib/http";
import { reviewAction } from "@/lib/memories";

const ActionZ = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("hide") }),
  z.object({ action: z.literal("note"), note: z.string().max(280) }),
]);

/** PATCH /api/review/memories/:id — approve, hide or edit the note (owner only). */
export const PATCH = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireSession();
  const { id } = await ctx.params;
  const body = ActionZ.parse(await req.json());
  const res = await reviewAction(s.personId, id, body.action === "note" ? { type: "note", note: body.note } : { type: body.action });
  if (!res) throw new HttpError(404, "memory not found");
  return NextResponse.json({ memory: res });
});
