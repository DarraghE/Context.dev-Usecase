import fsp from "node:fs/promises";
import { desc, eq } from "drizzle-orm";
import { SUPPORTED_PLATFORMS } from "@/config";
import { getDb } from "@/db/client";
import { bookings, uploads } from "@/db/schema";
import { detectPlatform } from "@/parsers/detect";
import { listEntries } from "@/parsers/zip";
import { enqueue } from "@/pipeline/runner";
import { hasActiveConsent } from "@/privacy/consent";
import { keys, storage } from "@/storage";
import { audit } from "./audit";
import { newId, nowIso } from "./ids";

export class ConsentRequiredError extends Error {
  constructor() {
    super("Please give consent before uploading.");
  }
}

export const UNSUPPORTED_MESSAGE = `We couldn't recognise this file as a platform export. Supported: ${SUPPORTED_PLATFORMS.join(", ")}. Upload the .zip exactly as the platform delivered it (JSON format for Instagram and Facebook).`;

/**
 * Registers a completed upload: moves it to raw storage, detects the platform from the zip
 * structure (US-2 AC3), and either rejects it with a clear message (AC5) or queues the pipeline.
 */
export async function registerUpload(input: { personId: string; bookingId: string; srcPath: string; originalName: string | null }) {
  if (!(await hasActiveConsent(input.personId))) {
    await fsp.rm(input.srcPath, { force: true });
    throw new ConsentRequiredError(); // P1 / US-1 AC3
  }
  const db = getDb();
  const id = newId();
  const storageKey = keys.raw(input.personId, id);
  const st = await fsp.stat(input.srcPath);
  await storage.move(input.srcPath, storageKey);

  let platform: ReturnType<typeof detectPlatform> = "unknown";
  let fileCount = 0;
  try {
    const entries = await listEntries(storage.pathFor(storageKey));
    fileCount = entries.length;
    platform = detectPlatform(entries.map((e) => e.name));
  } catch {
    platform = "unknown";
  }

  const now = nowIso();
  if (platform === "unknown") {
    await storage.delete(storageKey);
    await db.insert(uploads).values({
      id,
      personId: input.personId,
      bookingId: input.bookingId,
      platform,
      storageKey: null,
      originalName: input.originalName,
      bytes: st.size,
      status: "failed",
      stats: { files_found: fileCount },
      error: UNSUPPORTED_MESSAGE,
      createdAt: now,
      updatedAt: now,
    });
    await audit({ actor: input.personId, action: "upload.rejected", bookingId: input.bookingId, targetType: "upload", targetId: id, detail: { bytes: st.size } });
    return { id, platform, status: "failed" as const, error: UNSUPPORTED_MESSAGE };
  }

  await db.insert(uploads).values({
    id,
    personId: input.personId,
    bookingId: input.bookingId,
    platform,
    storageKey,
    originalName: input.originalName,
    bytes: st.size,
    status: "uploaded",
    stats: { files_found: fileCount },
    error: null,
    createdAt: now,
    updatedAt: now,
  });
  await db.update(bookings).set({ status: "collecting", updatedAt: now }).where(eq(bookings.id, input.bookingId));
  await audit({ actor: input.personId, action: "upload.received", bookingId: input.bookingId, targetType: "upload", targetId: id, detail: { platform, bytes: st.size } });
  await enqueue(input.bookingId, "ingest", id);
  return { id, platform, status: "uploaded" as const, error: null };
}

export async function listOwnUploads(personId: string) {
  return getDb().select().from(uploads).where(eq(uploads.personId, personId)).orderBy(desc(uploads.createdAt));
}
