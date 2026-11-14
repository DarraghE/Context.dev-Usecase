import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/config";
import { requireBooking } from "@/lib/access";
import { handler, HttpError, requireSession } from "@/lib/http";
import { newId } from "@/lib/ids";
import { ConsentRequiredError, registerUpload } from "@/lib/uploads";
import { storage } from "@/storage";

/**
 * Demo-only (DEMO_MODE=1): uploads one of the synthetic fixture exports for this partner,
 * through exactly the same path as a real upload. Lets the demo run without a file picker.
 */
export const POST = handler(async (req: Request) => {
  if (!config.demoMode) throw new HttpError(404, "not found");
  const s = await requireSession();
  const bookingId = requireBooking(s);
  const { which } = z.object({ which: z.enum(["instagram", "google_photos", "facebook", "unknown"]) }).parse(await req.json());
  const file = { instagram: "aino_instagram.zip", google_photos: "sam_google_takeout.zip", facebook: "facebook_variant.zip", unknown: "not_an_export.zip" }[which];
  const src = path.resolve(process.cwd(), "fixtures", "exports", file);
  if (!fs.existsSync(src)) throw new HttpError(404, "sample exports not built yet — run `npm run fixtures`");
  const tmp = storage.pathFor(`tus/sample-${newId()}.zip`);
  await fsp.mkdir(path.dirname(tmp), { recursive: true });
  await fsp.copyFile(src, tmp);
  try {
    const r = await registerUpload({ personId: s.personId, bookingId, srcPath: tmp, originalName: file });
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    if (e instanceof ConsentRequiredError) throw new HttpError(403, e.message);
    throw e;
  }
});
