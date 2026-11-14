import path from "node:path";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import exifr from "exifr";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { config } from "@/config";
import { getDb } from "@/db/client";
import { items, uploads, type FoodDetection } from "@/db/schema";
import { runBatch, structured, ClaudeRefusalError } from "@/integrations/claude";
import { getReplay, recordReplay, ReplayMissingError } from "@/integrations/replay";
import { arr, bool, enumOf, FOOD_CATEGORIES, num, obj, SCENES, SETTING_FLAGS, str } from "@/integrations/schema";
import { audit } from "@/lib/audit";
import { localDateIn, tzFor } from "@/lib/geo";
import { nowIso } from "@/lib/ids";
import { forEachEntry } from "@/parsers/zip";
import { facesInCrop, type Box } from "@/privacy/blur";
import { loadPrompt } from "@/prompts";
import { keys, storage } from "@/storage";
import { cropBox, cropJpeg, dHash, DHASH_DUPLICATE_BITS, dimensions, hamming, preprocess } from "./preprocess";
import { isCancelled, type StageContext } from "./runner";

/* --------------------------- schema (§7.3 + additions) --------------------------- */

const ITEM_SCHEMA = obj({
  dish_name: str(),
  dish_generic: str(),
  category: enumOf(FOOD_CATEGORIES),
  cuisine: str(),
  is_homemade_guess: bool(),
  confidence: num("0 to 1"),
  bbox: arr(num(), "[x0, y0, x1, y1] as fractions of the image"),
});
const RESULT_SCHEMA = obj({
  image_id: str(),
  has_food_or_drink: bool(),
  items: arr(ITEM_SCHEMA),
  scene: enumOf(SCENES),
  people_visible: bool(),
  face_boxes: arr(arr(num()), "one [x0, y0, x1, y1] box per visible face"),
  setting_flags: arr(enumOf(SETTING_FLAGS)),
});
export const DETECT_SCHEMA = obj({ results: arr(RESULT_SCHEMA) });

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const BoxZ = z
  .array(z.number())
  .length(4)
  .transform((b) => {
    const [a, c, d, e] = b.map(clamp) as [number, number, number, number];
    return [Math.min(a, d), Math.min(c, e), Math.max(a, d), Math.max(c, e)] as [number, number, number, number];
  });
export const ImageResultZ = z.object({
  image_id: z.string(),
  has_food_or_drink: z.boolean(),
  items: z.array(
    z.object({
      dish_name: z.string().min(1),
      dish_generic: z.string(),
      category: z.enum(FOOD_CATEGORIES),
      cuisine: z.string(),
      is_homemade_guess: z.boolean(),
      confidence: z.number().transform(clamp),
      bbox: BoxZ,
    }),
  ),
  scene: z.enum(SCENES),
  people_visible: z.boolean(),
  face_boxes: z.array(BoxZ),
  setting_flags: z.array(z.enum(SETTING_FLAGS)).default([]),
});
const DetectResponseZ = z.object({ results: z.array(ImageResultZ) });
type ImageResult = z.infer<typeof ImageResultZ>;

/* --------------------------------- helpers --------------------------------- */

type Prepared = { itemId: string; basename: string; jpeg: Buffer; width: number; height: number };

const replayKeyFor = (sourcePath: string) => path.posix.basename(sourcePath);

function imageContent(group: Prepared[]): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const p of group) {
    blocks.push({ type: "text", text: `image_id: ${p.itemId}` });
    blocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: p.jpeg.toString("base64") } });
  }
  blocks.push({ type: "text", text: `Return exactly one result for each of these image_ids, in any order: ${group.map((g) => g.itemId).join(", ")}.` });
  return blocks;
}

/** Detects food in a group of up to 8 images (one request), live or replayed. */
async function detectGroup(group: Prepared[], bookingId: string): Promise<Map<string, ImageResult | Error>> {
  const out = new Map<string, ImageResult | Error>();
  if (config.demoReplay) {
    for (const p of group) {
      const entry = getReplay<{ stop_reason: string; output: unknown }>("claude/food_detect", p.basename);
      if (!entry) out.set(p.itemId, new ReplayMissingError("claude/food_detect", p.basename));
      else if (entry.stop_reason === "refusal") out.set(p.itemId, new ClaudeRefusalError("refused (replay)"));
      else out.set(p.itemId, ImageResultZ.parse({ ...(entry.output as object), image_id: p.itemId }));
    }
    return out;
  }
  try {
    const res = await structured({
      stage: "food_detect",
      model: config.models.foodDetect,
      effort: config.effort.foodDetect,
      prompt: loadPrompt("food_detect"),
      content: imageContent(group),
      schema: DETECT_SCHEMA,
      validate: DetectResponseZ,
      replayKey: group.map((g) => g.basename).join(","),
      noRecord: true,
      bookingId,
    });
    const byId = new Map(res.results.map((r) => [r.image_id, r]));
    for (const p of group) {
      const r = byId.get(p.itemId) ?? (group.length === 1 ? res.results[0] : undefined);
      if (!r) out.set(p.itemId, new Error("no result for image"));
      else {
        out.set(p.itemId, { ...r, image_id: p.itemId });
        if (config.record) recordReplay("claude/food_detect", p.basename, { stop_reason: "end_turn", output: { ...r, image_id: p.basename }, model: config.models.foodDetect, recorded_at: nowIso() });
      }
    }
  } catch (e) {
    for (const p of group) out.set(p.itemId, e instanceof Error ? e : new Error(String(e)));
  }
  return out;
}

/** Turns a detection into stored state: food crop (only if food), faces mapped into the crop. */
async function applyResult(p: Prepared, personId: string, r: ImageResult | Error) {
  const db = getDb();
  if (r instanceof Error) {
    await db
      .update(items)
      .set({ detectStatus: "error", skipReason: r instanceof ClaudeRefusalError ? "refused" : r.message.slice(0, 200) })
      .where(eq(items.id, p.itemId));
    return;
  }
  const foodItems = r.items.filter((i) => i.confidence >= config.detect.foodConfidence);
  const isFood = r.has_food_or_drink && foodItems.length > 0;
  const detection: FoodDetection = { ...r, items: r.items, source: config.demoReplay ? "replay" : "live" };
  let mediaKey: string | null = null;
  if (isFood) {
    const box = cropBox(foodItems.map((i) => i.bbox as Box));
    const crop = await cropJpeg(p.jpeg, box, p.width, p.height);
    mediaKey = keys.crop(personId, p.itemId);
    await storage.put(mediaKey, crop);
    // Faces: if people are visible but no boxes came back, detection is unusable → null (fail closed, P6).
    detection.faces_in_crop = r.people_visible && r.face_boxes.length === 0 ? undefined : facesInCrop(r.face_boxes as Box[], box);
  }
  await db.update(items).set({ detectStatus: "done", isFood, food: detection, mediaKey, skipReason: null }).where(eq(items.id, p.itemId));
}

/* ---------------------------------- stage ---------------------------------- */

export async function runDetectFood(ctx: StageContext): Promise<void> {
  const db = getDb();
  const upload = (await db.select().from(uploads).where(eq(uploads.id, ctx.inputRef)))[0];
  if (!upload) throw new Error("upload not found");
  if (upload.status === "failed") return;

  const pending = await db
    .select()
    .from(items)
    .where(and(eq(items.uploadId, upload.id), eq(items.kind, "photo"), eq(items.detectStatus, "pending")));

  if (pending.length && upload.storageKey) {
    const byPath = new Map(pending.map((i) => [i.sourcePath, i]));
    const known = (
      await db
        .select({ hash: items.contentHash })
        .from(items)
        .where(and(eq(items.personId, upload.personId), isNotNull(items.contentHash), ne(items.uploadId, "__none__")))
    ).map((r) => r.hash!);

    const useBatch = !config.demoReplay && pending.length > config.detect.batchThreshold;
    const perRequest = config.detect.imagesPerRequest;
    const counts = { too_small: 0, duplicate: 0, unreadable: 0 };
    const inflight = new Set<Promise<void>>();
    let group: Prepared[] = [];
    const batchBuffer: Prepared[] = [];

    const flush = async (g: Prepared[]) => {
      if (!g.length) return;
      const results = await detectGroup(g, ctx.bookingId);
      for (const p of g) await applyResult(p, upload.personId, results.get(p.itemId)!);
    };

    await forEachEntry(
      storage.pathFor(upload.storageKey),
      (name) => byPath.has(name),
      async (name, data) => {
        if (isCancelled(upload.personId)) throw new Error("cancelled: consent withdrawn");
        const item = byPath.get(name)!;
        const dims = await dimensions(data);
        if (!dims) {
          counts.unreadable++;
          await db.update(items).set({ detectStatus: "skipped", skipReason: "unsupported format" }).where(eq(items.id, item.id));
          return;
        }
        if (dims.width < config.detect.minEdgePx || dims.height < config.detect.minEdgePx) {
          counts.too_small++;
          await db.update(items).set({ detectStatus: "skipped", skipReason: "smaller than 200×200 px" }).where(eq(items.id, item.id));
          return;
        }
        const hash = await dHash(data);
        if (known.some((k) => k.length === hash.length && hamming(k, hash) <= DHASH_DUPLICATE_BITS)) {
          counts.duplicate++;
          await db.update(items).set({ detectStatus: "skipped", skipReason: "duplicate", contentHash: hash }).where(eq(items.id, item.id));
          return;
        }
        known.push(hash);

        // EXIF is only a fallback for dates / GPS the sidecar or post lacked (Takeout).
        const patch: Partial<typeof items.$inferInsert> = { contentHash: hash };
        if (!item.takenAt || item.lat === null) {
          try {
            const ex = await exifr.parse(data, { gps: true, pick: ["DateTimeOriginal", "CreateDate", "latitude", "longitude"] });
            const taken = item.takenAt ?? (ex?.DateTimeOriginal instanceof Date ? ex.DateTimeOriginal.toISOString() : ex?.CreateDate instanceof Date ? ex.CreateDate.toISOString() : null);
            const lat = item.lat ?? (typeof ex?.latitude === "number" ? ex.latitude : null);
            const lng = item.lng ?? (typeof ex?.longitude === "number" ? ex.longitude : null);
            const tz = tzFor(lat, lng, item.tz ?? "UTC");
            Object.assign(patch, { takenAt: taken, lat, lng, tz, localDate: taken ? localDateIn(taken, tz) : null });
          } catch {
            /* no EXIF */
          }
        }
        await db.update(items).set(patch).where(eq(items.id, item.id));

        const pre = await preprocess(data);
        const prepared: Prepared = { itemId: item.id, basename: replayKeyFor(item.sourcePath), ...{ jpeg: pre.jpeg, width: pre.width, height: pre.height } };
        if (useBatch) {
          batchBuffer.push(prepared);
          return;
        }
        group.push(prepared);
        if (group.length >= perRequest) {
          const g = group;
          group = [];
          const task = flush(g).finally(() => inflight.delete(task));
          inflight.add(task);
          while (inflight.size >= config.detect.concurrency) await Promise.race(inflight);
        }
      },
    );
    await flush(group);
    await Promise.all(inflight);

    if (useBatch) {
      // Message Batches (50% cost) for large uploads, in chunks to stay under request-size limits.
      for (let i = 0; i < batchBuffer.length; i += 100) {
        const chunk = batchBuffer.slice(i, i + 100);
        const results = await runBatch({
          stage: "food_detect",
          model: config.models.foodDetect,
          effort: config.effort.foodDetect,
          prompt: loadPrompt("food_detect"),
          schema: DETECT_SCHEMA,
          validate: DetectResponseZ,
          bookingId: ctx.bookingId,
          requests: chunk.map((p) => ({ custom_id: p.itemId, replayKey: p.basename, content: imageContent([p]) as Anthropic.ContentBlockParam[] })),
        });
        for (const p of chunk) {
          const r = results.get(p.itemId);
          const value = !r ? new Error("missing batch result") : r.ok ? (r.value.results[0] ? { ...r.value.results[0], image_id: p.itemId } : new Error("empty result")) : new Error(r.error);
          await applyResult(p, upload.personId, value);
        }
      }
    }

    const stats = { ...upload.stats, skipped_too_small: counts.too_small, skipped_duplicate: counts.duplicate, skipped_unreadable: counts.unreadable };
    await db.update(uploads).set({ stats, updatedAt: nowIso() }).where(eq(uploads.id, upload.id));
  }

  // P2: the raw zip is deleted as soon as parsing and detection are done. Captions were
  // already copied into `items` by ingest, so later stages never need the zip.
  const stillPending = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.uploadId, upload.id), eq(items.detectStatus, "pending")));
  if (!stillPending.length && upload.storageKey) {
    await storage.delete(upload.storageKey);
    const fresh = (await db.select().from(uploads).where(eq(uploads.id, upload.id)))[0]!;
    await db.update(uploads).set({ storageKey: null, status: "raw_deleted", updatedAt: nowIso() }).where(eq(uploads.id, upload.id));
    await audit({ actor: "system", action: "upload.raw_deleted", bookingId: upload.bookingId, targetType: "upload", targetId: upload.id, detail: { stats: fresh.stats } });
  } else if (stillPending.length && !upload.storageKey) {
    // Raw file already swept (24 h limit): the remaining photos can no longer be read.
    await db.update(items).set({ detectStatus: "skipped", skipReason: "raw export expired" }).where(and(eq(items.uploadId, upload.id), eq(items.detectStatus, "pending")));
  }
}
