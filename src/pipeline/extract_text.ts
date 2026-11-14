import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { config } from "@/config";
import { getDb } from "@/db/client";
import { items, people, type TextExtraction } from "@/db/schema";
import { structured } from "@/integrations/claude";
import { getReplay, recordReplay, ReplayMissingError } from "@/integrations/replay";
import { arr, bool, enumOf, EVENT_TYPES, FOOD_CATEGORIES, num, obj, str, TEXT_SENSITIVE } from "@/integrations/schema";
import { nowIso, sha256 } from "@/lib/ids";
import { loadPrompt } from "@/prompts";
import { isCancelled, type StageContext } from "./runner";

const RESULT_SCHEMA = obj({
  text_id: str(),
  food_mentions: arr(obj({ text: str(), normalised: str(), category: enumOf(FOOD_CATEGORIES) })),
  event_cues: arr(obj({ type: enumOf(EVENT_TYPES), quote: str(), confidence: num() })),
  sentiment: num("-1 to 1"),
  mentions_other_people: bool(),
  sensitive_cues: arr(enumOf(TEXT_SENSITIVE)),
});
export const TEXT_SCHEMA = obj({ results: arr(RESULT_SCHEMA) });

const clamp = (lo: number, hi: number) => (v: number) => Math.min(hi, Math.max(lo, v));
export const TextResultZ = z.object({
  text_id: z.string(),
  food_mentions: z.array(z.object({ text: z.string(), normalised: z.string(), category: z.string() })),
  event_cues: z.array(z.object({ type: z.enum(EVENT_TYPES), quote: z.string(), confidence: z.number().transform(clamp(0, 1)) })),
  sentiment: z.number().transform(clamp(-1, 1)),
  mentions_other_people: z.boolean(),
  sensitive_cues: z.array(z.enum(TEXT_SENSITIVE)).default([]),
});
const TextResponseZ = z.object({ results: z.array(TextResultZ) });

/**
 * P10: no partner names or emails go to any external service. Names of everyone on the
 * booking are replaced with "[partner]" before captions are sent to Claude.
 */
export function redactNames(text: string, names: string[]): string {
  let out = text;
  const tokens = new Set<string>();
  for (const n of names) {
    if (!n) continue;
    tokens.add(n.trim());
    for (const part of n.split(/[\s&,.]+/)) if (part.length >= 2) tokens.add(part);
  }
  for (const t of [...tokens].sort((a, b) => b.length - a.length)) {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "giu"), "[partner]");
  }
  return out;
}

export async function redactionList(bookingId: string): Promise<string[]> {
  const ppl = await getDb().select().from(people).where(eq(people.bookingId, bookingId));
  return ppl.flatMap((p) => [p.displayName, p.email, p.email.split("@")[0]!]).filter(Boolean);
}

/** Replay key: hash of the original caption (local only; never sent anywhere). */
export const textReplayKey = (caption: string) => sha256(caption.normalize("NFC"));

/** §7.4: food mentions, life-event cues and sentiment from captions, ≤50 texts per call. */
export async function runExtractText(ctx: StageContext): Promise<void> {
  const db = getDb();
  const pending = await db
    .select()
    .from(items)
    .where(and(eq(items.uploadId, ctx.inputRef), eq(items.textStatus, "pending")));
  if (!pending.length) return;
  const names = await redactionList(ctx.bookingId);

  // One extraction per distinct text (carousel photos share a caption).
  const byText = new Map<string, typeof pending>();
  for (const it of pending) {
    const red = redactNames(it.caption ?? "", names).trim();
    if (!red) continue;
    byText.set(red, [...(byText.get(red) ?? []), it]);
  }
  const texts = [...byText.keys()];
  const results = new Map<string, TextExtraction | Error>();

  if (config.demoReplay) {
    for (const t of texts) {
      const key = textReplayKey(byText.get(t)![0]!.caption ?? "");
      const entry = getReplay<{ output: unknown }>("claude/text_extract", key);
      results.set(t, entry ? { ...TextResultZ.parse({ ...(entry.output as object), text_id: "x" }) } : new ReplayMissingError("claude/text_extract", key));
    }
  } else {
    for (let i = 0; i < texts.length; i += config.text.batchSize) {
      if (isCancelled(ctx.personId)) throw new Error("cancelled: consent withdrawn");
      const batch = texts.slice(i, i + config.text.batchSize);
      const payload = batch.map((t, j) => ({ text_id: `t${j}`, text: t }));
      try {
        const res = await structured({
          stage: "text_extract",
          model: config.models.textExtract,
          effort: config.effort.textExtract,
          prompt: loadPrompt("text_extract"),
          content: [{ type: "text", text: JSON.stringify(payload) }],
          schema: TEXT_SCHEMA,
          validate: TextResponseZ,
          replayKey: "batch",
          noRecord: true,
          bookingId: ctx.bookingId,
        });
        const byId = new Map(res.results.map((r) => [r.text_id, r]));
        batch.forEach((t, j) => {
          const r = byId.get(`t${j}`);
          results.set(t, r ?? new Error("no result for text"));
          if (r && config.record) recordReplay("claude/text_extract", textReplayKey(byText.get(t)![0]!.caption ?? ""), { stop_reason: "end_turn", output: r, model: config.models.textExtract, recorded_at: nowIso() });
        });
      } catch (e) {
        for (const t of batch) results.set(t, e instanceof Error ? e : new Error(String(e)));
      }
    }
  }

  for (const [t, its] of byText) {
    const r = results.get(t);
    for (const it of its) {
      if (!r || r instanceof Error) {
        await db.update(items).set({ textStatus: "error" }).where(eq(items.id, it.id));
      } else {
        await db.update(items).set({ textStatus: "done", textFoodMentions: { ...r, text_id: it.id } }).where(eq(items.id, it.id));
      }
    }
  }
  // Items whose caption was only names → nothing to extract.
  await db.update(items).set({ textStatus: "none" }).where(and(eq(items.uploadId, ctx.inputRef), eq(items.textStatus, "pending")));
}
