# Decisions and VERIFY log

Builder's log per BUILD_SPEC §0 rules 1 and 6. Dates are 2026-11-14 unless noted.

## VERIFY results

### Export formats (§7.1)
Checked with Context.dev Answers (request `e06d1f40-783c-436b-b16e-c5f4b1ca1956`), sources gerben.dev/posts/instagram-archive, dev.to (parsing Instagram/TikTok/X/Facebook exports), metadatafixer.com (Takeout JSON), takeoutday.org guides.
- **Instagram:** posts in `your_instagram_activity/content/posts_1.json` or `your_instagram_activity/posts/posts_1.json` (legacy: `content/posts_1.json`). Per media: `uri`, `creation_timestamp`, `title`, `media_metadata.photo_metadata.exif_data[].latitude/longitude`. Single-media posts carry the caption in `media[].title`; carousels at post level. Location names are generally absent; the parser reads them tolerantly if present.
- **Facebook:** `your_facebook_activity/posts/your_posts__check_ins__photos_and_videos_1.json`; `data[].post` text, `timestamp`, `attachments[].data[]` with `media{uri,…}` or `place{name, coordinate{latitude,longitude}, address}`.
- **Google Takeout:** sidecars `<image>.json` (older) or `<image>.supplemental-metadata.json` (since late 2024), with truncated variants; `photoTakenTime.timestamp`, `geoData`/`geoDataExif` (0,0 = none), `description`. Takeout duplicates album photos into "Photos from YYYY" (deduped by perceptual hash).
- **Mojibake:** confirmed for Instagram and Facebook (UTF-8 bytes as `\u00XX`). Repaired only when the string is all ≤ U+00FF and re-decodes as valid UTF-8.
- Fixtures exist for every variant: `aino_instagram.zip`, `instagram_legacy.zip`, `facebook_variant.zip`, `sam_google_takeout.zip` (both sidecar namings), plus `not_an_export.zip`.

### Context.dev (§9.2)
Read docs.context.dev (Map, Answers, SDK pages) and the `context.dev@3.29.0` TypeScript SDK types.
- `POST /v1/web/answers` → `client.web.answers({ task, mode, json_format, timeoutOpts })`; response `json_content`, `sources`, `request_id`, `partial`. `json_format` is an example object, not JSON Schema.
- `GET /v1/web/urls` (Map) → `client.web.mapUrls({ domain, search, maxLinks, urlRegex })`.
- `POST /v1/web/scrape` → `client.web.scrape`. Each output is `{requested, success, data, error_code, message}`. **`imageParams.enrich` is an array** (`["dimensions","classification","file"]`). Prebuilt `links` parser via `formats.parse` + `parseParams: {type:"prebuilt", parser:"links"}`. PDF OCR is `sharedParams.parsers.pdf.ocr: "auto"` (an enum, not a boolean).
- Batches → `client.batch.submit({ input: { mode: "scrape", data: { urls, formats, jsonParams, … } } })`, `retrieve(id).status` (`pending|queued|running|cancelling|completed|cancelled|failed`), `getResults(id, {cursor})`.
- Errors: `402 USAGE_EXCEEDED` stops enrichment for 10 min (circuit breaker); `429` honours `error_data.retry_after_seconds` (3 retries); `408`/5xx retry once; everything else recorded as `enrichments.status = error`, never blocking.

### Context.dev Answers vs Claude web search for place resolution (§7.6)
Decision: **Claude web search identifies the venue from coordinates** (only Claude may see coordinates, P10); **Context.dev Answers turns the venue name + city into the official website** and is preferred when it is confident; Claude's website is the fallback.
Observed on the four demo venues (live, fast mode):
- Sheep Heid Inn: correct website.
- Löyly and Pizzeria Starita: `website_url: null` with confidence ≈ 1, while `sources` held the official site → we use the origin of the first non-directory source. Reported as feedback `fb_99246d9cd3b31552fc9f82b595a0387f`.
- Da Michele: one run returned the real site (`damichele.net`), a later identical-shape run returned a parked domain (`anticapizzeriadamichele.it`, confidence 0.99). Enrichment now treats a site with no Map URLs and no links (title = domain) as parked and falls back to the alternative website. Feedback `fb_e0cfd6a0b656f73a6325cbe5e5ef5b84`.
- Scrape JSON returned price `":null"` on Starita; normalised in `cleanMenu`. Feedback `fb_a3a3ae5249eb528f3f1bef4a0744e602`.
Conclusion: Answers is good at "name + city → site" but needs the two guards above; keep Claude's website as a second opinion.

### Menu discovery heuristics
Map results and link anchors are ranked: `menu|ruokalista|carte|…` +2, `a-la-carte|dinner|food|dessert` +1, `/en/` +1, seasonal/news/drinks pages −3. If nothing matches, links that name the city (with local aliases such as Napoli) and same-site pages cited by Answers are used, then the home page. Scraping stops once a page yields ≥ 5 items (saves credits). `menu_is_image` when no items were extracted but a non-decorative, menu-or-QR-named, page-shaped image is present (Da Michele's QR code); otherwise `no_menu` (Sheep Heid's script-rendered menu — also tried `waitFor` 6–8 s and `includeFrames`).

### Claude SDK (§9.1)
Checked against `@anthropic-ai/sdk@1.8.0` types and the Claude API skill docs.
- Calls use `client.beta.messages.create` / `.stream(...).finalMessage()` with `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`, `output_config: { effort, format: { type: "json_schema", schema } }`. Outputs are re-validated with zod. `stop_reason` is checked first; `refusal` marks the item as an error.
- Batches: `client.messages.batches.create/retrieve/results` (no `fallbacks` on batches); results keyed by `custom_id` (item id), recorded under the image basename.
- Web search tool type `web_search_20260209`; `pause_turn` is resumed up to 3 times.
- No prefill, no temperature/top_p. Stable system prompt first with `cache_control` so image batches share a cached prefix.

### Face detector Node binding (§5.1)
`@mediapipe/tasks-vision` is a browser (WASM + canvas) package; we did not adopt a Node binding in the time available. **Decision:** face boxes come from the same Claude detection call (`face_boxes`), padded by 25 % and blurred with sigma 24; if people are visible but no boxes came back, or detection failed, the chef gets **no image** (fail closed, P6). Detection only, never recognition (P7). Revisit with a local detector (e.g. an ONNX face model via `onnxruntime-node`) before production.

### Zero data retention (§10 note)
Not verified: needs an account-level check with Anthropic for `claude-opus-5-5` before production. Context.dev requests can set `zdr: "enabled"` if the organisation has ZDR.

## Choices (rule 6: simplest option that meets the criteria)

- **Stack versions:** Next.js 16.4 (App Router, `src/proxy.ts` — `middleware` was renamed), React 19.3, TypeScript 5.9 (TS 7 lacks the compiler API Next uses), Drizzle 0.45 on **libsql** (`@libsql/client`; `better-sqlite3` has no prebuilt binary for Node 26 on Windows), zod 4, vitest 5, Playwright 1.65. Exact versions pinned.
- **Auth:** an `invites` table makes magic links single-use (`jti`). Caterer admins belong to a `caterers` row (`people.booking_id` is null for them). A demo-only endpoint issues a caterer link when `DEMO_MODE=1`.
- **Schema additions** (marked "added:" in `schema.ts`): `items.local_date/post_ref/authored_by_other/place_address_raw/detect_status/text_status/skip_reason`; `moments.moment_key/place_status`; `places.cache_key/city/website_source/hints`; `memories.dish_key/dish_family/dish_category/source_item_id/hidden_by_default/reviewed_at`; `consents.relationship_start_date`; `menus.validation`; `bookings.default_tz`; detection fields `face_boxes`, `setting_flags`, `faces_in_crop`; text field `sensitive_cues`.
- **Idempotency:** items unique on (upload, source_path, kind); moments keyed by person + day + earliest item; memories unique on (moment, dish_key); places on cache key; enrichments on place. Re-running any stage produces the same rows (tested).
- **Event classification** is rule-based over Claude's caption cues (own captions only), then "far from home" (> 100 km from the person's most common 0.5° cell) → trip, fixed holiday dates → holiday, else everyday. No extra model call.
- **Scoring interpretations:** proximity counts the memory's own moment when it is a proposal/first date/anniversary; recurrence counts distinct moments per **dish family** (`dish_generic`, e.g. "neapolitan pizza") across the **whole booking**; ties keep insertion order.
- **Sensitive flags:** `alcohol_heavy` is a hint only and does not hide (§7.8 says "only shown as a hint"). A partner's explicit choice is never overridden by a re-run.
- **Dedupe:** 256-bit dHash, ≤ 12 bits apart. The 64-bit variant merged different plates on the same table.
- **HEIC** is counted as unsupported (sharp prebuilds lack HEVC).
- **Detection:** one image per request by default (`DETECT_IMAGES_PER_REQUEST`, up to 8, supported); single vs multi was **not measured** (no API key in the build environment). Concurrency 6. Message Batches above 200 images per spec; note that batch latency is outside our control, so AC4 (< 30 min / 1,000 photos) is measured in direct mode by `npm run test:accuracy`.
- **Dish-matching effort:** `low` (not specified in §9.1).
- **P10 redaction:** every booking member's name and email are replaced with `[partner]` before captions go to Claude. Coordinates go to Claude for venue lookup only; Context.dev never sees them.
- **Places/enrichments** are public venue data cached across bookings, but are garbage-collected when no moment links to them (privacy over cache hit rate; Context.dev's own 7-day `maxAgeMs` cache still saves credits).
- **Menu replay** cites dish keys and is mapped to the current approved memories; unapproved citations are dropped and the course becomes structural.
- **Allergen check** scans course title and description for allergen words as well as the listed allergens; a variant must name the allergy (or "X-free").
- **Uploads:** tus via `@tus/server`'s `handleWeb` inside Next route handlers; consent checked in `onUploadCreate`; ownership checked on every PATCH/HEAD. Demo "use sample export" buttons go through the same `registerUpload`.
- **Bug fixed during the browser walkthrough:** after a withdrawal the runner's cancellation flag also blocked the partner's next uploads; re-consenting now clears it and re-queues stuck uploads.

## Replay data provenance

- `fixtures/replay/contextdev.json`: **live** Context.dev responses (request ids kept), recorded through the Context.dev MCP server; structural edits only (see its `_provenance`).
- `fixtures/replay/claude/*.json`: **synthetic** — no `ANTHROPIC_API_KEY` was available, so outputs were authored from the dataset's ground truth. They prove the pipeline end to end, not model accuracy. Run `npm run test:accuracy` and `npm run replay:record` with a key to replace them.

## Open items

1. Live detection accuracy and AC4 timing (`npm run test:accuracy`) — needs an API key.
2. A local face detector to replace model-reported face boxes.
3. ZDR eligibility (Anthropic, Context.dev).
4. Context.dev on PDF and image menus (open question 1): OCR is on; no demo venue had a PDF menu.
5. Dated web-archive lookup for historical menus (Next).
