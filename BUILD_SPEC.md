# Wedding Food Memory — Build Specification

**Status:** ready to build · **Version:** 1.0 · **Date:** 2026-11-14
**Audience:** an AI coding agent (and the humans reviewing its work)
**Source documents:** the Wedding Food Memory PRD (claude.ai doc) and the team's discussion on 14 Nov 2026. This spec supersedes the PRD wherever they differ.

---

## 0. Instructions to the builder

Read this whole document before writing code. Then build **in the phase order of §14**, finishing each phase's acceptance checks before you start the next.

Rules:

1. **Do not invent external API shapes.** Where this spec says **VERIFY**, read the vendor's live docs before writing that code and record what you found in `docs/decisions.md`.
2. **Privacy rules in §10 are requirements, not suggestions.** Each one has a test. A build that skips them is not done.
3. **Never scrape behind a login.** Private data enters the system only as files the user uploads. Context.dev and web search are used only on public pages.
4. Keep every model prompt in `src/prompts/` as a versioned file. No inline prompt strings.
5. Every pipeline stage must be **idempotent and resumable**: re-running it on the same input produces the same rows and no duplicates.
6. When something is ambiguous, pick the simplest option that satisfies the acceptance criteria, and log the choice in `docs/decisions.md`.
7. Don't add features that aren't in this document.

---

## 1. Product summary

Wedding Food Memory turns a consenting couple's own photos, posts and stories into a timeline of the meals that mattered to them, so the caterer's chef can design a wedding menu around those moments.

Example: the couple's Instagram export shows a photo captioned "SHE SAID YES 💍" on 14 June 2024, and a photo of Eton mess from the same evening. The system surfaces *"Proposal, 14 Jun 2024: Eton mess"* as a top memory and suggests a dessert course built on it.

It is sold by caterers as a **bonus add-on to a wedding catering package**.

**Where Context.dev fits:** private data tells us *where* and *when* the couple ate. Context.dev scrapes the public website of each place to tell us *what was on the menu*, so a geotag becomes a dish.

---

## 2. Scope

### 2.1 MVP (this build)
User stories US-1 to US-7 (§4), the caterer setup needed to create a booking, and the synthetic demo dataset (§12).

### 2.2 Next (design for, don't build)
US-8 friends' stories, US-9 surprise mode, US-10 caterer billing and deletion log UI. Leave the data model ready for them (fields are marked `[next]` in §6).

### 2.3 Non-goals
- Scraping social networks, or logging in to any account on a user's behalf.
- Face **recognition** (identifying who someone is). Face **detection**, used only to blur faces, is allowed.
- Video analysis. Videos in exports are skipped and counted.
- Guest-facing features, payments, mobile apps, and languages other than English. The data model stores text in its original language.

---

## 3. Users and roles

| Role | Who | Can do | Cannot do |
|---|---|---|---|
| `caterer_admin` | Caterer staff | Create bookings, invite the couple and the chef, see booking status, trigger deletion | See any memory content |
| `partner` | Each of the two people marrying (`partner_a`, `partner_b`) | Consent, upload their own exports, review and approve memories | Upload for the other partner; see the other partner's unapproved memories |
| `chef` | Assigned chef | See approved memories, the timeline and menu drafts; edit menu drafts | See raw uploads, unapproved or hidden memories, or faces |
| `system` | Pipeline workers | Process data | — |

**Auth (MVP):** magic links. Each invite is a single-use signed token (JWT, HS256, 7-day expiry) that is exchanged for an httpOnly session cookie. There are no passwords.

---

## 4. User stories and acceptance criteria

Priorities: **MVP** = build now · **Next** = later.

### US-1 Consent (MVP)
*As a couple, I want to opt in from my catering package on one consent screen that says what is collected, who sees it and when it is deleted, so that I feel safe sharing years of personal photos.*

- AC1: Each partner sees a consent screen, from their own invite link, listing: data sources, purpose (this wedding's menu only), who sees what (chef sees approved memories only), retention (raw files deleted after processing, everything deleted 30 days after the wedding date), and the right to withdraw.
- AC2: Consent is per partner and is recorded with a timestamp, the consent text version (a hash) and the IP address.
- AC3: Uploads are blocked until that partner has consented.
- AC4: Withdrawing consent deletes that partner's uploads, derived memories and enrichment links within 5 minutes, and the deletion is logged.
- AC5: The pipeline runs for each partner separately, so one partner's consent is enough to process their own data.

### US-2 Upload exports (MVP)
*As a partner, I want to upload my Instagram, Facebook and Google Photos exports in one place, so that the system can find food moments without me hunting for photos.*

- AC1: The upload page shows short, platform-specific instructions for downloading each export (links to the platforms' own help pages).
- AC2: It accepts `.zip` files up to 5 GB each, using resumable chunked upload (tus protocol, or S3 multipart in production).
- AC3: The system detects the platform from the zip's structure, not its file name (§7.1).
- AC4: Progress shows files found, photos queued, and items skipped with the reason (video, unsupported format, duplicate).
- AC5: An unrecognised zip produces a clear error naming the platforms that are supported.

### US-3 Detect food (MVP)
*As a couple, I want every photo, caption and post with food in it found automatically, so that I don't have to tag or sort anything myself.*

- AC1: Every image goes through food detection (§7.3). For images with food, the result records dish names, cuisine, a food/drink flag, a confidence score and a rough bounding box.
- AC2: Every caption and post text goes through food-mention extraction (§7.4).
- AC3: On the demo dataset, at least 90% of the seeded food photos are detected and at most 5% of the non-food photos are flagged as food (§13).
- AC4: Processing 1,000 photos finishes in under 30 minutes in the default configuration.

### US-4 Match moments (MVP)
*As a chef, I want each food memory linked to the life event around it (proposal, first date, trip), so that I know which dishes carry real meaning, not just which were eaten often.*

- AC1: Items are grouped into **moments** (same partner, same local day, within 3 km, or the same post) (§7.5).
- AC2: Each moment has an `event_type` from a fixed list (§6) and the evidence for it: the caption quote, the date, the place.
- AC3: Each food memory has a significance score from 0 to 100, computed by the formula in §7.7, with its components stored.
- AC4: On the demo dataset, the proposal moment (Eton mess) ranks first.

### US-5 Enrich places with Context.dev (MVP)
*As a chef, I want the restaurant behind a geotag or check-in turned into its real menu and dish details, so that I can recreate or reinterpret what they actually ate.*

- AC1: Every moment with a place name or coordinates goes through place resolution (§7.6).
- AC2: For each resolved place with a public website, Context.dev scrapes the menu into structured JSON (§9.2).
- AC3: The photographed dish is matched to a menu item where possible, storing the item name, description, price if listed, and the source URL.
- AC4: Every enrichment stores its source URL and scrape timestamp, and the chef view shows them.
- AC5: Failures (no website, menu in an image, timeout) are recorded with a reason and never block the pipeline.

### US-6 Couple approval (MVP)
*As a couple, I want to approve or hide each memory before the chef sees it, so that nothing private or painful reaches the menu.*

- AC1: Each partner sees a review queue of their own memories, sorted by significance.
- AC2: The actions are approve, hide, or edit the note (a short story line for the chef).
- AC3: Memories flagged as sensitive (§7.8) start hidden and are labelled "hidden by default".
- AC4: The chef API never returns unapproved or hidden memories. An automated test proves it (§13).
- AC5: Photos shown in the queue are the partner's own originals. The chef-facing derivative is generated only after approval (§10).

### US-7 Chef timeline and menu draft (MVP)
*As a chef, I want a timeline of the top food memories, ranked by significance, each with a suggested course, so that I can draft a personal menu in one sitting.*

- AC1: The chef sees approved memories as a timeline (oldest to newest) and a ranked list (most significant first), and can switch between them.
- AC2: Each memory card shows the dish, the event, the date, the place, the couple's note, the face-blurred food image, and enrichment from Context.dev with its source link.
- AC3: The booking's dietary constraints (allergies, vegetarian count, etc., entered by the caterer) are shown at the top and passed to menu generation.
- AC4: "Draft menu" generates a five-course menu (§7.9). Each course cites the memory IDs it draws on, and no course violates a stated allergy.
- AC5: The chef can edit, reorder and regenerate single courses, and save versions.

### US-8 Friends' stories (Next)
*As a friend or family member, I want to add a food memory through a link, with no account, so that the menu includes stories the couple forgot or never posted.*
A story is free text plus an optional photo and date. It enters the couple's approval queue as source `friend_story`.

### US-9 Surprise mode (Next)
*As a partner planning a surprise, I want to keep one memory hidden from my partner until the wedding, using only photos I took, so that one course can be a surprise on the day.*
Only memories from the uploader's own data can be marked surprise. They are hidden from the other partner's views, including the menu draft.

### US-10 Caterer add-on and deletion (Next)
*As a caterer, I want to sell this as a priced add-on with data deleted automatically after the event, so that I earn more per booking without taking on data risk.*
The MVP already runs the deletion job (§10). This story adds the pricing field and a deletion-log screen.

---

## 5. Architecture

### 5.1 Stack

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js (App Router) + TypeScript**, one repo | One deployable for the UI and API; typed end to end |
| DB | **SQLite via Drizzle ORM** for the hackathon; **Postgres** in production (same schema) | No setup for the demo; a clean path to production |
| Jobs | In-process queue (`p-queue`) with a `jobs` table for resumability; **BullMQ + Redis** in production | Simple now; the same job interface later |
| File storage | Local `./storage/` for the demo; **S3-compatible** in production (EU region) | Raw exports and derivatives |
| Image processing | `sharp` (resize, crop, blur); a face *detector* such as MediaPipe Face Detector (VERIFY the Node binding) | Face blur only |
| EXIF | `exifr` | Dates and GPS from Google Takeout photos |
| Zip | `yauzl` (streaming) | Exports can be several GB |
| LLM | **Claude API** via `@anthropic-ai/sdk` (§9.1) | Vision, extraction, matching, menu generation |
| Web context | **Context.dev** via its TypeScript SDK `context.dev` or REST (§9.2) | Menus and restaurant details from public sites |
| Validation | `zod` for every external payload and every model output | Fail loudly on bad data |
| Tests | `vitest` (unit), `playwright` (end to end) | |

Pin exact versions in `package.json`. Use current stable releases.

### 5.2 Components

```
 Browser (partner / chef / caterer UI)
        │  HTTPS, session cookie
        ▼
 Next.js API routes ──────────► DB (bookings, consents, items, moments, memories, enrichments, menus, audit)
        │                       Storage (raw zips → deleted, food crops, blurred derivatives)
        ▼
 Job runner (pipeline stages §7, each one idempotent)
   ingest → detect_food → extract_text → build_moments → classify_events
          → resolve_places → enrich_context_dev → match_dishes → score → flag_sensitive
        │                         │
        ▼                         ▼
   Claude API                Context.dev API (public web only)
```

### 5.3 Directory layout

```
wedding-food-memory/
  BUILD_SPEC.md            ← this file
  docs/decisions.md        ← builder's log of choices and VERIFY results
  src/
    app/                   ← Next.js routes and pages (§8, §11)
    db/schema.ts           ← Drizzle schema (§6)
    pipeline/              ← one file per stage (§7)
    parsers/               ← instagram.ts, facebook.ts, google_takeout.ts
    integrations/          ← claude.ts, contextdev.ts
    prompts/               ← *.md prompt files with version headers
    privacy/               ← consent, deletion, blur, access guards
    scoring/               ← significance.ts (§7.7)
  fixtures/                ← synthetic exports for tests (§12)
  scripts/seed-demo.ts
  tests/
```

---

## 6. Data model

All IDs are UUIDv7. All timestamps are UTC ISO 8601, and local times are stored with their IANA time zone. `[next]` marks a field that is unused in the MVP.

**bookings**: `id`, `caterer_id`, `wedding_date` (date), `couple_display_name`, `dietary_constraints` (JSON: `{allergies: string[], diets: {vegetarian: n, vegan: n, ...}, notes}`), `status` (`invited|collecting|reviewing|chef_ready|deleted`), `delete_after` (= wedding_date + 30 days), `addon_price_eur` [next], timestamps.

**people**: `id`, `booking_id`, `role` (`partner_a|partner_b|chef|caterer_admin`), `email`, `display_name`.

**consents**: `id`, `person_id`, `consent_text_version` (sha256), `granted_at`, `withdrawn_at`, `ip`.

**uploads**: `id`, `person_id`, `platform` (`instagram|facebook|google_photos|unknown`), `storage_key`, `bytes`, `status` (`uploaded|parsing|parsed|failed|raw_deleted`), `stats` (JSON counts), `error`.

**items**: one row per photo or text post found in an export.
`id`, `upload_id`, `person_id`, `kind` (`photo|post_text|comment|checkin`), `taken_at`, `tz`, `lat`, `lng`, `place_name_raw`, `caption`, `source_path` (path inside the zip), `media_key` (stored food crop, only if food is found), `content_hash` (for dedupe), `is_food`, `food` (JSON from §7.3), `text_food_mentions` (JSON from §7.4).

**moments**: `id`, `booking_id`, `person_id`, `local_date`, `centroid_lat`, `centroid_lng`, `place_id`, `event_type` (enum below), `event_confidence`, `event_evidence` (JSON: quotes + item ids), `item_ids` (JSON).

`event_type` enum: `proposal`, `engagement_celebration`, `first_date`, `anniversary`, `birthday`, `trip`, `holiday_celebration`, `family_gathering`, `everyday`, `other`.

**places**: `id`, `name`, `address`, `lat`, `lng`, `website_url`, `resolution_method` (`export_place|web_search|manual`), `resolution_confidence`.

**enrichments**: `id`, `place_id`, `source_url`, `scraped_at`, `provider` (`context.dev`), `request_id` (from the provider), `menu` (JSON §9.2 schema), `status` (`ok|no_website|no_menu|menu_is_image|error`), `error`.

**memories**: the unit the couple approves and the chef sees.
`id`, `booking_id`, `person_id`, `moment_id`, `dish_name`, `dish_description`, `menu_item_match` (JSON: `{enrichment_id, item_name, item_description, price, match_confidence}` or null), `significance` (0–100), `significance_parts` (JSON), `sensitive_flags` (string[]), `status` (`pending|approved|hidden`), `couple_note`, `chef_image_key` (blurred derivative, created on approval), `source` (`export|friend_story` [next]), `surprise` (bool) [next], timestamps.

**menus**: `id`, `booking_id`, `version`, `courses` (JSON §7.9), `created_by` (`chef|system`), `model`, `prompt_version`.

**jobs**: `id`, `booking_id`, `stage`, `input_ref`, `status` (`queued|running|done|failed`), `attempts`, `error`, timestamps.

**audit_log**: `id`, `at`, `actor_person_id|system`, `action`, `target_type`, `target_id`, `detail` (JSON). Every consent, upload, approval, hide, chef view of a memory, menu generation, deletion, and every external API call (provider + request ID, never content) is logged.

---

## 7. Pipeline

Each stage reads from the DB, writes to the DB, and is safe to re-run. Stages run per upload, except where noted.

### 7.1 Ingest and parse

Stream the zip and detect the platform from its structure:

| Platform | Detect by | Read |
|---|---|---|
| Instagram | a JSON file matching `**/posts_*.json` or `**/content/posts_1.json` | each post's media list: image path, creation timestamp, title/caption; optional location |
| Facebook | `**/your_posts*.json` or `**/posts/*.json`, plus `**/photos_and_videos/**` | post text, timestamp, attachments' media paths, place names on check-ins |
| Google Photos (Takeout) | `Takeout/Google Photos/**` with image files plus `*.json` sidecars | sidecar `photoTakenTime.timestamp`, `geoData`/`geoDataExif`, `description`; EXIF via `exifr` as a fallback |

**VERIFY:** export formats change. Before writing a parser, find each platform's current export format from its help pages, write tolerant parsers (search by key name, not fixed paths), and add fixture zips for every variant you support. Instagram and Facebook exports may encode text as mojibake (UTF-8 bytes read as Latin-1). Detect and repair this.

- Skip videos (count them). Skip images under 200×200 px.
- Dedupe on a perceptual hash (`sharp` dHash) within each person.
- Do not keep full images after detection. Keep only a food crop (§7.3) for items where food is detected.
- When parsing has finished and §7.3 is done for the upload, **delete the raw zip** and set the upload's status to `raw_deleted`.

### 7.2 Image preprocessing
Resize to a long edge of at most 1568 px and convert to JPEG at quality 85 before sending to Claude. Strip EXIF from anything stored or sent.

### 7.3 Food detection (vision)

- One Claude request per image, or several images per request (up to 8, with a stable ID per image). Measure both and choose the faster one that meets AC3.
- **Use the Message Batches API** (50% cost, asynchronous) for uploads with more than 200 images. Use direct requests for smaller uploads and for the live demo.
- Use structured outputs (`output_config.format` with a JSON schema) so the result always validates:

```json
{
  "image_id": "string",
  "has_food_or_drink": true,
  "items": [
    {
      "dish_name": "Eton mess",
      "dish_generic": "meringue, cream and strawberry dessert",
      "category": "dessert",          // starter|main|dessert|drink|snack|bread|cake|other
      "cuisine": "British",
      "is_homemade_guess": false,
      "confidence": 0.86,
      "bbox": [0.12, 0.30, 0.78, 0.95]  // x0,y0,x1,y1 as fractions; rough
    }
  ],
  "scene": "restaurant",              // restaurant|home|outdoor|event|other
  "people_visible": true
}
```

- An item is food if `confidence ≥ 0.6`. Store the crop: the union of the item bounding boxes plus a 10% margin, cropped from the preprocessed image.
- The prompt (`src/prompts/food_detect.v1.md`) must say: name the specific dish when it is recognisable, otherwise give a generic description; never identify people; ignore food in adverts or on screens.

### 7.4 Text food-mention extraction
For each caption, post text or check-in, extract food and drink mentions, sentiment, and life-event cues, using one structured-output call per batch of up to 50 texts:

```json
{
  "text_id": "string",
  "food_mentions": [{"text": "eton mess", "normalised": "Eton mess", "category": "dessert"}],
  "event_cues": [{"type": "proposal", "quote": "SHE SAID YES", "confidence": 0.95}],
  "sentiment": 0.9,                   // -1..1
  "mentions_other_people": true       // used only by sensitive flagging, never shown
}
```

### 7.5 Build moments
Within each person, group items by local calendar day. Within a day, split into clusters more than 3 km apart. Items from the same post are always one moment. Moments with no food item and no food mention are dropped.

### 7.6 Place resolution
For each moment:
1. If the export has a place name (Instagram location, Facebook check-in), use it with the coordinates.
2. Otherwise, if the moment has coordinates, ask Claude with the **web search server tool** (`web_search_20260209`) for the most likely food venue near those coordinates, given the place name if any, the date and the dishes. It must return the venue name, address and official website, or `null`. Require a confidence of at least 0.7.
3. Cache resolutions by (rounded coordinates, name) across bookings.
4. Never resolve a place that looks like a private home (Claude's `scene: home` for every food item in the moment): skip enrichment and record `resolution_method = null`.

**VERIFY:** Context.dev also lists Search and Answers products. If they can turn a venue name and city into an official website reliably, prefer them over Claude web search for step 2, and log the comparison in `docs/decisions.md`.

### 7.7 Significance score (0–100)

```
significance = min(100,
    event_weight[event_type] * event_confidence            // up to 45
  + 15 * max(0, sentiment)                                 // up to 15
  + recurrence_bonus                                       // up to 15: the same normalised dish in ≥3 distinct moments → 15; 2 → 8
  + proximity_bonus                                        // up to 10: the dish appears within ±1 day of a proposal/first date/anniversary moment
  + 5 if menu_item_match.match_confidence ≥ 0.7            // a real dish we can cite
  + 10 if a friend story corroborates it [next]
)
event_weight: proposal 45, engagement_celebration 40, first_date 40, anniversary 30,
              birthday 20, trip 20, holiday_celebration 15, family_gathering 15, everyday 5, other 5
```

Keep the weights in `src/scoring/config.ts` and store each component in `significance_parts`.

### 7.8 Sensitive flagging
Set `sensitive_flags` and start the memory as `hidden` when any of these apply:
- `hospital_or_medical` (from the scene or the caption)
- `funeral_or_grief`
- `possible_ex_partner`: a romantic-event cue dated before the couple's relationship start date. The relationship start date is asked on the consent screen and is optional; without it, flag romantic events dated more than 10 years before the wedding.
- `alcohol_heavy` (only shown as a hint to the couple)
- `other_people_private`: the caption is mainly about another person

The couple can approve a flagged memory. Flags are never shown to the chef.

### 7.9 Menu draft generation
Input: the approved memories (dish, event, date, place, couple note, menu-item match), the dietary constraints, the season of the wedding date, and the course structure (default five courses: amuse, starter, main, pre-dessert, dessert).

Output schema:

```json
{
  "courses": [
    {
      "position": 1,
      "course": "dessert",
      "title": "Proposal-night Eton mess, reimagined",
      "description": "…",
      "story_for_menu_card": "One line the couple could print.",
      "memory_ids": ["…"],
      "allergens": ["milk", "egg"],
      "dietary_variants": [{"for": "vegan", "change": "aquafaba meringue, oat cream"}],
      "seasonality_note": "…"
    }
  ],
  "unused_memories_worth_considering": ["…"]
}
```

- Every course must cite at least one memory ID, or set `memory_ids: []` and say it is a structural course.
- **Validate in code** that no course lists a booking allergen without offering a variant. If a course fails, regenerate that course once, then flag it for the chef.
- Model: default model at `effort: "high"`, streaming.

---

## 8. Internal API (Next.js route handlers)

All routes require a session. Role checks are enforced in a single middleware (`src/privacy/guards.ts`), never per page.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/bookings` | caterer_admin | Create a booking with dietary constraints and invite emails |
| GET | `/api/bookings/:id/status` | caterer_admin, partner, chef | Stage progress counts only |
| POST | `/api/invites/:token/exchange` | public | Magic link → session |
| GET/POST | `/api/consent` | partner | Read the consent text; grant consent |
| POST | `/api/consent/withdraw` | partner | Withdraw consent and cascade deletion |
| POST | `/api/uploads` (tus) | partner (consented) | Resumable upload |
| GET | `/api/review/memories?status=` | partner | Own memories only |
| PATCH | `/api/review/memories/:id` | partner (owner) | approve, hide, edit note |
| GET | `/api/chef/memories?view=timeline\|ranked` | chef | **Approved only**; blurred images |
| POST | `/api/chef/menus` | chef | Generate a draft |
| PATCH | `/api/chef/menus/:id` | chef | Save edits as a new version |
| POST | `/api/bookings/:id/delete` | caterer_admin | Delete everything now |
| GET | `/api/media/:key` | per-key ACL | Signed and short-lived (5 min); chef keys resolve only to blurred derivatives |

---

## 9. External integrations

### 9.1 Claude API
- SDK: `@anthropic-ai/sdk`. Key in `ANTHROPIC_API_KEY`.
- Default model: **`claude-opus-5-5`** for every stage, set in one config file. Make the model configurable per stage (`MODEL_FOOD_DETECT`, `MODEL_TEXT_EXTRACT`, `MODEL_PLACE_RESOLVE`, `MODEL_MENU`). Choosing a cheaper model for bulk photo detection is a cost decision for the team, so log any change in `docs/decisions.md` and re-run the §13 accuracy check.
- Thinking is adaptive by default on this model and cannot be disabled. Control depth with `output_config.effort`: `low` for detection and extraction, `medium` for place resolution, `high` for menu generation.
- Use **structured outputs** (`output_config.format`) for every call that returns data, and validate again with zod.
- Use **streaming** with `finalMessage()` for menu generation. Use **Message Batches** for bulk detection (§7.3). Results arrive in any order, so key them by `custom_id`.
- Always check `stop_reason` before reading content. Handle `refusal` by marking the item `error` and moving on. Enable the server-side refusal fallback (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`).
- No assistant prefill (rejected by this model). No `temperature` / `top_p`.
- Prompt caching: put the stable system prompt and the schema first, so batches of images share a cached prefix.
- **VERIFY** the exact SDK method names against the SDK README before writing code.

### 9.2 Context.dev
Verified on 2026-11-14 from docs.context.dev:
- Base URL `https://api.context.dev/v1`. Auth header `Authorization: Bearer $CONTEXT_DEV_API_KEY`.
- SDK: npm package `context.dev` (`ContextDev` client), or plain REST.
- **`POST /v1/web/scrape`** takes `url` and `formats` (an object, at least one `true`). The formats include `markdown`, `html`, `screenshot`, `images`, `parse`, `json`, `highlights` and others.
  - `jsonParams: { schema, instructions }` → structured extraction. **Use this for menus.**
  - `sharedParams.mainContentOnly`, `sharedParams.parsers.pdf: { ocr: true }` for PDF menus, `sharedParams.waitFor` for JavaScript-rendered sites.
  - `imageParams.enrich` (options include `dimensions`, `classification`, `file`; VERIFY whether it takes an array or an object) to pull dish photos from the page.
  - `maxAgeMs` lets a cached scrape be reused. Use 7 days.
  - Each output in the response reports `requested`, `success`, `data`, and on failure `error_code` and `message`. Store the response's `request_id`.
  - Status codes to handle: 400, 401, 402 (out of credits), 403, 408, 409, 410, 422, 429 (back off and retry), 500.
- **VERIFY:** paths and parameters for **Map** (list a domain's URLs, used to find the menu page), **Search**, **Answers** and **Batches** were not in the docs page that was read. Look them up before using them.

**Menu enrichment flow:**
1. Given `place.website_url`, call **Map** (VERIFY) or scrape the home page with the `parse` format and the `links` parser to find menu pages (URL or anchor text matching `menu|ruokalista|carte|food|dinner|lunch|dessert`). Take up to 3 candidate pages.
2. Scrape each candidate with `formats: { json: true, images: true }`, the `jsonParams.schema` below, and PDF OCR on.
3. If every candidate returns no items, set `status = menu_is_image` or `no_menu`.

```json
{
  "type": "object",
  "properties": {
    "restaurant_name": {"type": "string"},
    "menu_sections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "section": {"type": "string"},
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": {"type": "string"},
                "description": {"type": "string"},
                "price": {"type": "string"},
                "dietary_tags": {"type": "array", "items": {"type": "string"}}
              },
              "required": ["name"]
            }
          }
        },
        "required": ["section", "items"]
      }
    }
  },
  "required": ["menu_sections"]
}
```

**Dish matching:** give Claude the detected dish (name, generic description, category) and the scraped menu items, and ask for the best match or `null`, with `match_confidence`. Accept matches at 0.7 or above.

**Known limitation:** today's menu may differ from the menu on the date of the memory. Show the scrape date to the chef, labelled "current menu". A dated web archive lookup is a Next item.

### 9.3 Environment variables
`ANTHROPIC_API_KEY`, `CONTEXT_DEV_API_KEY`, `SESSION_SECRET`, `DATABASE_URL`, `STORAGE_DIR` or `S3_*`, `APP_BASE_URL`, `MODEL_*` (optional overrides). Ship a `.env.example`. Never commit `.env`.

---

## 10. Privacy, consent and security requirements

Every row needs an automated test (§13).

| ID | Requirement |
|---|---|
| P1 | No processing of a person's data before their consent row exists and is not withdrawn. |
| P2 | Raw export zips are deleted after parsing and detection finish, and never later than 24 h after upload. |
| P3 | Full-size originals are never stored. Only food crops are kept, and only for items with food. |
| P4 | EXIF is stripped from every stored or transmitted image. |
| P5 | The chef API returns only `approved` memories. Hidden, pending and sensitive-flag data never leave the partner scope. |
| P6 | Chef images are derivatives with every detected face blurred (Gaussian, sigma ≥ 20). If face detection fails on an image, the chef gets no image for that memory. |
| P7 | No face recognition, no identity inference, and no people names extracted from images. |
| P8 | Comments and messages written by other people are never shown to anyone. They are used only to detect food mentions about the couple's own posts. |
| P9 | Deletion job: daily, it deletes every booking past `delete_after`, including storage objects, and logs counts. Withdrawal deletion runs within 5 minutes. |
| P10 | External calls send only what each stage needs: food crops (never whole photos) to Claude for matching steps; only public URLs to Context.dev. No partner names or emails go to any external service. |
| P11 | Signed media URLs expire after 5 minutes and are tied to the session's role. |
| P12 | The audit log records every access to memory content by the chef. |
| P13 | GDPR roles are documented in `docs/privacy.md`: the caterer is the controller and this service is the processor. EU hosting is used in production. |

**Note on P3 and §7.3:** food detection must see the whole image to find food. The whole image is sent to Claude once and is not stored. If the team needs stricter data handling, check Anthropic's data retention options (zero data retention eligibility) for the chosen model before production. VERIFY.

---

## 11. UI screens (MVP)

Keep the UI plain and accessible: WCAG AA contrast, keyboard navigable, works at 375 px width.

1. **Caterer › New booking:** couple name, wedding date, partner emails, chef email, dietary constraints form → creates the booking and sends invites (in the MVP, show the invite links on screen instead of emailing them).
2. **Partner › Consent:** the full consent text, an optional relationship start date, and a consent button.
3. **Partner › Upload:** platform cards with how-to-export steps, a drop zone, per-upload progress and skip reasons.
4. **Partner › Processing:** stage progress bars (parsed → food found → moments → places → menus → scored).
5. **Partner › Review:** a card list sorted by significance. Each card shows the photo, dish, date, place, event badge, the evidence quote, the "hidden by default" label where flagged, and approve / hide / note controls. Filters: pending, approved, hidden.
6. **Chef › Overview:** dietary constraints banner, and a timeline/ranked toggle.
7. **Chef › Memory card:** blurred image, dish, event, date, place, couple note, menu match with the source link and scrape date.
8. **Chef › Menu builder:** generate, a list of courses with cited memories as chips, edit/regenerate per course, version history.
9. **Caterer › Booking status:** counts only, plus a delete-now button behind a confirmation.

---

## 12. Synthetic demo data

`scripts/seed-demo.ts` builds **fixture exports** for a fictional couple, **Aino & Sam**, using no real people's data:

- An Instagram-format zip for partner A and a Google Takeout-format zip for partner B, about 200 images in total.
- About 30 food images. Use openly licensed food photos (for example CC0 from a stock site; record each source in `fixtures/LICENSES.md`) or generated images. About 170 non-food images: landscapes, objects, and people with faces generated or licensed CC0.
- Seeded story beats (the test oracle):
  1. **Proposal**, 2024-06-14, Edinburgh: caption "SHE SAID YES 💍", plus an Eton mess photo the same evening. **Must rank first.**
  2. **First date**, 2021-09-03: a check-in at a real public restaurant (choose one with an HTML menu page so Context.dev succeeds), plus a dish photo that matches a current menu item.
  3. **Trip**, 2023-05: three Neapolitan pizza photos in Naples (recurrence bonus).
  4. **Anniversary**, 2025-06-14: home-cooked risotto (scene `home` → no enrichment).
  5. A **sensitive** item: a hospital-cafeteria photo, which must start hidden.
  6. A restaurant whose menu is only an image, to exercise the `menu_is_image` path.
- Dietary constraints: 2 vegan guests, 1 nut allergy.

Ship a recorded-response mode (`DEMO_REPLAY=1`) that replays saved Claude and Context.dev responses, so the demo works offline and costs nothing.

**Demo script (the order to show on stage):** consent → upload both zips → processing finishes → review queue (hide one) → chef timeline (proposal first) → open the first-date card (Context.dev menu match with its source link) → generate the menu (the dessert cites the proposal memory, with a vegan variant and no nuts).

Optional tie-in to the team's main Valio project: when a course is dairy-heavy (for example Eton mess), show a "suggested ingredients" line that a later integration could map to wholesaler products. Display it only. Do not integrate in the MVP.

---

## 13. Testing and acceptance

| Area | Test |
|---|---|
| Parsers | Fixture zips for each platform and variant parse into the expected item counts; the mojibake repair works |
| Food detection | On the demo set: recall ≥ 90% on food images, false positives ≤ 5% (run live once, then lock the replay) |
| Moments and scoring | The proposal ranks #1; the pizza recurrence bonus applies; the home risotto has no enrichment |
| Context.dev | Contract test against the recorded responses; a live smoke test behind the `LIVE=1` flag; handles 402/429/408 |
| Dish matching | The first-date dish matches the seeded menu item at ≥ 0.7 |
| Sensitive | The hospital item starts `hidden` |
| P1–P13 | One test each, e.g. P5: create pending, hidden and approved memories, call the chef API, assert only the approved one returns; P2: assert the zip is gone after processing; P6: assert the chef image has a blurred face region (compare variance in the detected box) |
| Menu | No course contains the nut allergen without a variant; every course cites a memory or is marked structural |
| E2E | Playwright runs the full demo script in `DEMO_REPLAY=1` mode |

**Definition of done:** all tests pass, the demo script runs end to end in replay mode in under 5 minutes, `docs/decisions.md` records every VERIFY item, and `README.md` explains setup in 5 commands or fewer.

---

## 14. Build order

1. **Skeleton:** the Next.js app, Drizzle schema (§6), auth via magic links, role guards, the audit log, `.env.example`.
2. **Consent and upload:** US-1, US-2, P1, P2, P4. Parsers with fixtures.
3. **Detection:** §7.2–7.4 with replay mode. Tests for US-3.
4. **Moments and scoring:** §7.5, §7.7, §7.8.
5. **Places and Context.dev:** §7.6, §9.2, dish matching. Contract tests.
6. **Review UI:** US-6, the P5 and P6 blur pipeline.
7. **Chef UI and menu:** US-7, §7.9.
8. **Demo data and E2E:** §12, §13, then the deletion job P9.

At the end of each phase, run the tests and update `docs/decisions.md`.

---

## 15. Assumptions and open questions

**Assumptions (change them if wrong):**
- Both partners usually consent, but the product works with one.
- Couples will spend about 10 minutes downloading their exports. Platforms can take hours to deliver them, so the invite email should tell couples to request exports early.
- Menus scraped today are a fair proxy for past meals when labelled as the current menu.
- English UI. Data in any language.

**Open questions:**
1. Context.dev accuracy on PDF and image menus. Test early in phase 5.
2. Which platforms come first after the MVP: TikTok, Snapchat Memories, WhatsApp chat export?
3. Pricing of the add-on, and whether it is free in premium packages.
4. Whether the chef is employed by the caterer or contracted (this affects GDPR roles).
5. Whether to offer a dated web archive lookup for historical menus.
