import { getDb } from "@/db/client";
import { auditLog } from "@/db/schema";
import { newId, nowIso } from "./ids";

export type AuditAction =
  | "invite.created"
  | "invite.exchanged"
  | "booking.created"
  | "consent.granted"
  | "consent.withdrawn"
  | "upload.received"
  | "upload.rejected"
  | "upload.raw_deleted"
  | "memory.approved"
  | "memory.hidden"
  | "memory.note_edited"
  | "chef.memory_viewed"
  | "menu.generated"
  | "menu.course_regenerated"
  | "menu.saved"
  | "deletion.withdrawal"
  | "deletion.booking"
  | "deletion.daily_sweep"
  | "deletion.raw_sweep"
  | "external.claude"
  | "external.contextdev"
  | "pipeline.stage_failed";

/**
 * Appends to the audit log. `detail` must never contain memory content, captions,
 * images or personal data: only ids, counts, providers and request ids (§6, P12).
 */
export async function audit(entry: {
  actor: string;
  action: AuditAction;
  bookingId?: string | null;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await getDb()
    .insert(auditLog)
    .values({
      id: newId(),
      at: nowIso(),
      actor: entry.actor,
      bookingId: entry.bookingId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      detail: entry.detail ?? null,
    });
}
