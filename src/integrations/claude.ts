import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { config } from "@/config";
import { audit } from "@/lib/audit";
import type { Prompt } from "@/prompts";
import { getReplay, recordReplay, ReplayMissingError } from "./replay";
import type { JsonSchema } from "./schema";

/**
 * Claude API wrapper (§9.1):
 * - structured outputs via `output_config.format` on every data call, re-validated with zod;
 * - effort per stage via `output_config.effort` (thinking is adaptive and always on);
 * - server-side refusal fallback (`fallbacks: "default"`), stop_reason checked before content;
 * - stable system prompt first with a cache breakpoint so batches share a cached prefix;
 * - streaming + finalMessage() for long generations; Message Batches for bulk detection;
 * - DEMO_REPLAY=1 replays fixtures/replay/claude/<stage>.json; RECORD=1 saves live results.
 * No assistant prefill and no temperature/top_p (rejected by this model).
 */
export class ClaudeRefusalError extends Error {}
export class ClaudeOutputError extends Error {}

export type ReplayEntry<T> = { stop_reason: string; output: T; model?: string; recorded_at?: string; synthetic?: boolean };

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
let client: Anthropic | null = null;

export function claudeClient(): Anthropic {
  if (!client) {
    if (!config.anthropicApiKey && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new Error("ANTHROPIC_API_KEY is not set. Set it in .env, or run with DEMO_REPLAY=1.");
    }
    client = new Anthropic({ maxRetries: 3, timeout: 10 * 60 * 1000 });
  }
  return client;
}

type Effort = "low" | "medium" | "high";

export type StructuredCall<T> = {
  stage: string;
  model: string;
  effort: Effort;
  prompt: Prompt;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: JsonSchema;
  validate: z.ZodType<T>;
  replayKey: string;
  maxTokens?: number;
  tools?: Anthropic.Beta.BetaToolUnion[];
  stream?: boolean;
  bookingId?: string | null;
  /** The caller records per-item replays itself (e.g. multi-image detection). */
  noRecord?: boolean;
};

function systemBlocks(prompt: Prompt): Anthropic.Beta.BetaTextBlockParam[] {
  return [{ type: "text", text: prompt.text, cache_control: { type: "ephemeral" } }];
}

function extractJson(msg: Anthropic.Beta.BetaMessage): unknown {
  if (msg.stop_reason === "refusal") throw new ClaudeRefusalError(`refused (${msg.stop_details?.category ?? "unspecified"})`);
  if (msg.stop_reason === "max_tokens") throw new ClaudeOutputError("output truncated at max_tokens");
  const text = msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text) throw new ClaudeOutputError(`no text output (stop_reason ${msg.stop_reason})`);
  try {
    return JSON.parse(text);
  } catch {
    throw new ClaudeOutputError("output is not valid JSON");
  }
}

/** One structured-output call, live or replayed. */
export async function structured<T>(call: StructuredCall<T>): Promise<T> {
  const replayName = `claude/${call.stage}`;
  if (config.demoReplay) {
    const entry = getReplay<ReplayEntry<unknown>>(replayName, call.replayKey);
    if (!entry) throw new ReplayMissingError(replayName, call.replayKey);
    if (entry.stop_reason === "refusal") throw new ClaudeRefusalError("refused (replay)");
    return call.validate.parse(entry.output);
  }

  const c = claudeClient();
  const params = {
    model: call.model,
    max_tokens: call.maxTokens ?? (call.stream ? 64000 : 16000),
    betas: [FALLBACK_BETA],
    fallbacks: "default" as const,
    system: systemBlocks(call.prompt),
    output_config: { effort: call.effort, format: { type: "json_schema" as const, schema: call.schema } },
    ...(call.tools ? { tools: call.tools } : {}),
  };

  let messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: call.content }];
  let msg: Anthropic.Beta.BetaMessage;
  let requestId: string | null | undefined;
  // Server tools can pause a long turn; resume up to 3 times by sending the content back.
  for (let i = 0; ; i++) {
    if (call.stream) {
      const s = c.beta.messages.stream({ ...params, messages });
      msg = await s.finalMessage();
      requestId = s.request_id ?? null;
    } else {
      const r = await c.beta.messages.create({ ...params, messages, stream: false });
      msg = r;
      requestId = (r as unknown as { _request_id?: string | null })._request_id ?? null;
    }
    if (msg.stop_reason === "pause_turn" && i < 3) {
      messages = [...messages, { role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] }];
      continue;
    }
    break;
  }

  await audit({
    actor: "system",
    action: "external.claude",
    bookingId: call.bookingId ?? null,
    detail: { provider: "anthropic", stage: call.stage, model: msg.model, request_id: requestId ?? null, stop_reason: msg.stop_reason },
  });

  const raw = extractJson(msg);
  const parsed = call.validate.parse(raw);
  if (config.record && !call.noRecord) {
    recordReplay(replayName, call.replayKey, { stop_reason: msg.stop_reason ?? "end_turn", output: raw, model: msg.model ?? call.model, recorded_at: new Date().toISOString() } satisfies ReplayEntry<unknown>);
  }
  return parsed;
}

/* ------------------------------ Message Batches ------------------------------ */

export type BatchRequest = { custom_id: string; content: Anthropic.ContentBlockParam[]; replayKey?: string };

/**
 * Bulk detection through the Message Batches API (50% cost, asynchronous). Results come back
 * in any order and are keyed by custom_id. Batches don't take `fallbacks`; a refused item is
 * reported and the caller marks it as an error.
 */
export async function runBatch<T>(input: {
  stage: string;
  model: string;
  effort: Effort;
  prompt: Prompt;
  schema: JsonSchema;
  validate: z.ZodType<T>;
  requests: BatchRequest[];
  bookingId?: string | null;
  pollMs?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<Map<string, { ok: true; value: T } | { ok: false; error: string }>> {
  const c = claudeClient();
  const batch = await c.messages.batches.create({
    requests: input.requests.map((r) => ({
      custom_id: r.custom_id,
      params: {
        model: input.model,
        max_tokens: 16000,
        system: [{ type: "text", text: input.prompt.text, cache_control: { type: "ephemeral" } }],
        output_config: { effort: input.effort, format: { type: "json_schema", schema: input.schema } },
        messages: [{ role: "user", content: r.content }],
      },
    })),
  });
  await audit({ actor: "system", action: "external.claude", bookingId: input.bookingId ?? null, detail: { provider: "anthropic", stage: input.stage, batch_id: batch.id, requests: input.requests.length } });

  let status = batch;
  while (status.processing_status !== "ended") {
    await new Promise((r) => setTimeout(r, input.pollMs ?? 30_000));
    status = await c.messages.batches.retrieve(batch.id);
    const rc = status.request_counts;
    input.onProgress?.(rc.succeeded + rc.errored + rc.canceled + rc.expired, input.requests.length);
  }

  const out = new Map<string, { ok: true; value: T } | { ok: false; error: string }>();
  const replayKeys = new Map(input.requests.map((r) => [r.custom_id, r.replayKey ?? r.custom_id]));
  for await (const res of await c.messages.batches.results(batch.id)) {
    if (res.result.type !== "succeeded") {
      out.set(res.custom_id, { ok: false, error: res.result.type });
      continue;
    }
    try {
      const m = res.result.message as unknown as Anthropic.Beta.BetaMessage;
      const raw = extractJson(m);
      out.set(res.custom_id, { ok: true, value: input.validate.parse(raw) });
      if (config.record) recordReplay(`claude/${input.stage}`, replayKeys.get(res.custom_id) ?? res.custom_id, { stop_reason: m.stop_reason, output: raw, model: m.model, recorded_at: new Date().toISOString() });
    } catch (e) {
      out.set(res.custom_id, { ok: false, error: e instanceof Error ? e.message : "invalid output" });
    }
  }
  return out;
}
