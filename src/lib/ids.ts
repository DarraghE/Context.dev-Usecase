import { v7 as uuidv7 } from "uuid";
import crypto from "node:crypto";

/** All IDs are UUIDv7 (§6). */
export const newId = (): string => uuidv7();

export const nowIso = (): string => new Date().toISOString();

export function sha256(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
