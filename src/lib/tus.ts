import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { FileStore } from "@tus/file-store";
import { Server } from "@tus/server";
import { config } from "@/config";
import { hasActiveConsent } from "@/privacy/consent";
import { SESSION_COOKIE, verifySession, isPartner } from "@/privacy/session";
import { keys, storage } from "@/storage";
import { registerUpload } from "./uploads";

/**
 * Resumable chunked uploads with the tus protocol (US-2 AC2), up to 5 GB per zip.
 * In production the same endpoint fronts S3 multipart (@tus/s3-store).
 */
const g = globalThis as unknown as { __wfmTus?: Server };

function cookieValue(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return undefined;
}

const fail = (status_code: number, body: string) => Object.assign(new Error(body), { status_code, body });

export function tusServer(): Server {
  if (g.__wfmTus) return g.__wfmTus;
  const directory = storage.pathFor(keys.tusDir());
  fs.mkdirSync(directory, { recursive: true });
  const server = new Server({
    path: "/api/uploads",
    datastore: new FileStore({ directory }),
    maxSize: config.upload.maxBytes,
    respectForwardedHeaders: true,
    async onIncomingRequest(req, uploadId) {
      const s = await verifySession(cookieValue(req, SESSION_COOKIE));
      if (!s || !isPartner(s.role)) throw fail(401, "sign-in required");
      if (uploadId) {
        const meta = await fsp.readFile(path.join(directory, `${uploadId}.json`), "utf8").catch(() => null);
        if (meta && !meta.includes(s.personId)) throw fail(403, "not your upload");
      }
    },
    async onUploadCreate(req, upload) {
      const s = await verifySession(cookieValue(req, SESSION_COOKIE));
      if (!s || !isPartner(s.role) || !s.bookingId) throw fail(401, "sign-in required");
      if (!(await hasActiveConsent(s.personId))) throw fail(403, "Please give consent before uploading."); // US-1 AC3
      const name = upload.metadata?.filename ?? "export.zip";
      if (!/\.zip$/i.test(name)) throw fail(415, "Please upload the .zip file exactly as the platform delivered it.");
      return { metadata: { ...upload.metadata, personId: s.personId, bookingId: s.bookingId } };
    },
    async onUploadFinish(req, upload) {
      const personId = upload.metadata?.personId;
      const bookingId = upload.metadata?.bookingId;
      if (!personId || !bookingId) throw fail(400, "missing upload owner");
      const src = path.join(directory, upload.id);
      const result = await registerUpload({ personId, bookingId, srcPath: src, originalName: upload.metadata?.filename ?? null });
      await fsp.rm(path.join(directory, `${upload.id}.json`), { force: true });
      return { status_code: 204, headers: { "X-Upload-Id": result.id, "X-Upload-Status": result.status } };
    },
  });
  g.__wfmTus = server;
  return server;
}
