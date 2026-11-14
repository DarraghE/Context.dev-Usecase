import { and, eq, inArray } from "drizzle-orm";
import PQueue from "p-queue";
import { getDb } from "@/db/client";
import { jobs, uploads } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";

/**
 * In-process job runner with a `jobs` table for resumability (§5.1). In production the same
 * interface maps onto BullMQ + Redis. Every stage is idempotent, so a crashed or re-run job
 * produces the same rows.
 *
 *   per upload:  ingest → detect_food → extract_text
 *   per person:  build_moments → classify_events → resolve_places → enrich_context_dev
 *                → match_dishes → score → flag_sensitive
 */
export const UPLOAD_STAGES = ["ingest", "detect_food", "extract_text"] as const;
export const PERSON_STAGES = ["build_moments", "classify_events", "resolve_places", "enrich_context_dev", "match_dishes", "score", "flag_sensitive"] as const;
export type Stage = (typeof UPLOAD_STAGES)[number] | (typeof PERSON_STAGES)[number];

export type StageContext = { bookingId: string; inputRef: string; personId: string; jobId: string };
type StageFn = (ctx: StageContext) => Promise<void>;

const loaders: Record<Stage, () => Promise<StageFn>> = {
  ingest: async () => (await import("./ingest")).runIngest,
  detect_food: async () => (await import("./detect_food")).runDetectFood,
  extract_text: async () => (await import("./extract_text")).runExtractText,
  build_moments: async () => (await import("./build_moments")).runBuildMoments,
  classify_events: async () => (await import("./classify_events")).runClassifyEvents,
  resolve_places: async () => (await import("./resolve_places")).runResolvePlaces,
  enrich_context_dev: async () => (await import("./enrich_context_dev")).runEnrichContextDev,
  match_dishes: async () => (await import("./match_dishes")).runMatchDishes,
  score: async () => (await import("./score")).runScore,
  flag_sensitive: async () => (await import("./flag_sensitive")).runFlagSensitive,
};

function nextStage(stage: Stage): Stage | null {
  const u = UPLOAD_STAGES.indexOf(stage as (typeof UPLOAD_STAGES)[number]);
  if (u >= 0) return u < UPLOAD_STAGES.length - 1 ? UPLOAD_STAGES[u + 1]! : "build_moments";
  const p = PERSON_STAGES.indexOf(stage as (typeof PERSON_STAGES)[number]);
  return p >= 0 && p < PERSON_STAGES.length - 1 ? PERSON_STAGES[p + 1]! : null;
}

const isPersonStage = (s: Stage) => (PERSON_STAGES as readonly string[]).includes(s);

type RunnerState = {
  queue: PQueue;
  running: Set<string>; // inputRefs with a running job
  cancelled: Set<string>; // personIds whose work must stop
  started: boolean;
  timer?: ReturnType<typeof setInterval>;
  deletionTimer?: ReturnType<typeof setInterval>;
  autoStart: boolean;
};
const g = globalThis as unknown as { __wfmRunner?: RunnerState };

function state(): RunnerState {
  if (!g.__wfmRunner) g.__wfmRunner = { queue: new PQueue({ concurrency: 2 }), running: new Set(), cancelled: new Set(), started: false, autoStart: true };
  return g.__wfmRunner;
}

/** Tests drive the runner explicitly with runUntilIdle(). */
export function setAutoStart(v: boolean) {
  state().autoStart = v;
}

export function isCancelled(personId: string): boolean {
  return state().cancelled.has(personId);
}

export function cancelJobsFor(personId: string) {
  state().cancelled.add(personId);
  setTimeout(() => state().cancelled.delete(personId), 10 * 60_000).unref?.();
}

/** After a (re-)consent: lift any cancellation and re-queue uploads that never finished. */
export async function resumePerson(personId: string): Promise<void> {
  state().cancelled.delete(personId);
  const stuck = await getDb()
    .select()
    .from(uploads)
    .where(and(eq(uploads.personId, personId), inArray(uploads.status, ["uploaded", "parsing", "parsed"])));
  const refs = [personId, ...stuck.map((u) => u.id)];
  await getDb().delete(jobs).where(and(inArray(jobs.inputRef, refs), eq(jobs.status, "failed")));
  for (const u of stuck) if (u.storageKey) await enqueue(u.bookingId, "ingest", u.id);
}

async function personFor(stage: Stage, inputRef: string): Promise<string | null> {
  if (isPersonStage(stage)) return inputRef;
  const u = (await getDb().select({ personId: uploads.personId }).from(uploads).where(eq(uploads.id, inputRef)))[0];
  return u?.personId ?? null;
}

export async function enqueue(bookingId: string, stage: Stage, inputRef: string): Promise<void> {
  const db = getDb();
  const existing = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.stage, stage), eq(jobs.inputRef, inputRef), eq(jobs.status, "queued")));
  if (existing.length) return;
  await db.insert(jobs).values({ id: newId(), bookingId, stage, inputRef, status: "queued", attempts: 0, error: null, createdAt: nowIso(), updatedAt: nowIso() });
  if (state().autoStart) kick();
}

/** Picks queued jobs whose input is not already being worked on. */
async function claimNext(): Promise<(typeof jobs.$inferSelect) | null> {
  const db = getDb();
  const queued = await db.select().from(jobs).where(eq(jobs.status, "queued")).orderBy(jobs.createdAt).limit(20);
  const s = state();
  for (const j of queued) {
    if (s.running.has(j.inputRef)) continue;
    const claimed = await db
      .update(jobs)
      .set({ status: "running", attempts: j.attempts + 1, updatedAt: nowIso() })
      .where(and(eq(jobs.id, j.id), eq(jobs.status, "queued")))
      .returning();
    if (claimed.length) {
      s.running.add(j.inputRef);
      return claimed[0]!;
    }
  }
  return null;
}

async function runJob(job: typeof jobs.$inferSelect): Promise<void> {
  const db = getDb();
  const stage = job.stage as Stage;
  try {
    const personId = await personFor(stage, job.inputRef);
    if (!personId) throw new Error("input no longer exists");
    const { hasActiveConsent } = await import("@/privacy/consent");
    // P1: no processing without a live consent.
    if (!(await hasActiveConsent(personId)) || isCancelled(personId)) {
      await db.update(jobs).set({ status: "failed", error: "consent missing or withdrawn", updatedAt: nowIso() }).where(eq(jobs.id, job.id));
      return;
    }
    const fn = await loaders[stage]();
    await fn({ bookingId: job.bookingId, inputRef: job.inputRef, personId, jobId: job.id });
    await db.update(jobs).set({ status: "done", error: null, updatedAt: nowIso() }).where(eq(jobs.id, job.id));
    const next = nextStage(stage);
    if (next) await enqueue(job.bookingId, next, isPersonStage(next) ? personId : job.inputRef);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retry = job.attempts < 3;
    await db
      .update(jobs)
      .set({ status: retry ? "queued" : "failed", error: message.slice(0, 500), updatedAt: nowIso() })
      .where(eq(jobs.id, job.id));
    if (!retry) {
      const { audit } = await import("@/lib/audit");
      await audit({ actor: "system", action: "pipeline.stage_failed", bookingId: job.bookingId, targetType: "job", targetId: job.id, detail: { stage, attempts: job.attempts } });
    }
    console.error(`[pipeline] ${stage} failed (attempt ${job.attempts}):`, message);
  } finally {
    state().running.delete(job.inputRef);
  }
}

/** Starts as many jobs as the queue allows. */
export function kick() {
  const s = state();
  const fill = async () => {
    while (s.queue.size + s.queue.pending < s.queue.concurrency) {
      const job = await claimNext();
      if (!job) return;
      s.queue.add(async () => {
        await runJob(job);
        void fill();
      });
    }
  };
  void fill();
}

/** Runs queued jobs until none are left (tests, scripts). */
export async function runUntilIdle(maxMs = 10 * 60_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  const db = getDb();
  for (;;) {
    const job = await claimNext();
    if (job) {
      await runJob(job);
      continue;
    }
    await state().queue.onIdle();
    const left = await db.select({ id: jobs.id }).from(jobs).where(inArray(jobs.status, ["queued", "running"]));
    if (!left.length || Date.now() > deadline) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Starts the runner once per process: resumes interrupted jobs, schedules the deletion job. */
export function ensureRunner() {
  const s = state();
  if (s.started || !s.autoStart) return;
  s.started = true;
  void (async () => {
    const db = getDb();
    await db.update(jobs).set({ status: "queued", updatedAt: nowIso() }).where(eq(jobs.status, "running"));
    kick();
  })();
  s.timer = setInterval(kick, 5000);
  s.timer.unref?.();
  const daily = async () => {
    try {
      const { runDailyDeletion } = await import("@/privacy/deletion");
      await runDailyDeletion();
    } catch (e) {
      console.error("[deletion] daily job failed", e);
    }
  };
  setTimeout(daily, 10_000).unref?.();
  s.deletionTimer = setInterval(daily, 24 * 3600_000);
  s.deletionTimer.unref?.();
}
