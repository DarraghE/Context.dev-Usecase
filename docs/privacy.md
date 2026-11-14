# Privacy and data protection

Wedding Food Memory processes a couple's own photos and posts to help a caterer's chef design their wedding menu. This page records the GDPR roles, what is processed, and how each rule in BUILD_SPEC §10 (P1–P13) is enforced and tested.

## Roles (P13)

| Party | GDPR role | Notes |
|---|---|---|
| The caterer (e.g. "Juhla Catering Oy") | **Controller** | Sells the add-on, decides the purpose (this wedding's menu only), creates the booking, can delete it at any time. |
| Wedding Food Memory (this service) | **Processor** | Processes data only on the caterer's instructions, under a data processing agreement. |
| Anthropic (Claude API) | Sub-processor | Food detection, caption reading, place lookup from coordinates, dish matching, menu drafting. Check zero-data-retention eligibility for the chosen model before production (§10 note). |
| Context.dev | Sub-processor (public web only) | Receives only a venue name + city, a domain, or a public URL. Never personal data. |
| The chef | Recipient under the controller | Sees approved memories only. If the chef is a contractor rather than an employee, the caterer must cover them contractually (open question 4). |

**Hosting:** production runs in the **EU** (EU-region database and S3-compatible storage; Claude and Context.dev regions to be confirmed in the DPA). The hackathon demo runs locally.

**Lawful basis:** explicit, per-partner consent (Art. 6(1)(a)), recorded with timestamp, consent-text version (sha256) and IP. Photos may reveal special-category data (e.g. a hospital visit); sensitive moments start hidden and never reach the chef unless the partner approves them.

## Data flow

1. Each partner consents on their own invite link (US-1). Uploads stay locked until then.
2. The partner uploads their own platform export (.zip). We never log in to any account and never scrape behind a login.
3. Each photo is resized, stripped of EXIF and shown to Claude **once**. Only a crop of the food is stored, and only when food is found. The raw zip is deleted as soon as detection finishes.
4. Captions are sent to Claude with every booking member's name replaced by `[partner]`.
5. Venues: Claude may receive a food photo's coordinates to identify the restaurant; Context.dev then receives only the venue name and city, and the venue's public web addresses.
6. The partner reviews every memory. Approval creates a face-blurred copy for the chef.
7. Everything is deleted 30 days after the wedding, on withdrawal, or when the caterer deletes the booking.

## Requirements and their tests

All in `tests/privacy.test.ts` unless noted.

| ID | Enforcement | Test |
|---|---|---|
| P1 | `registerUpload` and the tus `onUploadCreate` hook refuse without live consent; the job runner re-checks consent before every stage. | "P1 — no processing before consent" |
| P2 | `detect_food` deletes the zip when detection is done; `sweepRawZips` (daily + on boot) deletes any zip older than 24 h. | "P2 — raw zips are deleted", `tests/pipeline.test.ts` |
| P3 | Only `crops/<person>/<item>.jpg` is ever written, for food items only. | "P3" |
| P4 | `sharp` drops metadata on every re-encode (`preprocess`, crops, chef derivatives). | "P4" |
| P5 | `chefList` selects `status = 'approved'` and never selects flags, person ids or captions. | "P5" |
| P6 | `blurFaces`: padded face boxes, Gaussian sigma 24; no face data → no chef image (fail closed). | "P6" |
| P7 | Prompt forbids identifying people; schema has no identity fields; face boxes are used only for blurring. | "P7" |
| P8 | Comments by others are flagged `authored_by_other`, used for food mentions only, never returned by any API. | "P8" |
| P9 | `runDailyDeletion` (daily timer + `npm run deletion:run`); withdrawal deletes synchronously and is logged. | "P9" |
| P10 | Context.dev wire log has no coordinates, dates, names or emails; captions are redacted before Claude. | "P10" |
| P11 | HMAC-signed media URLs, 5-minute expiry, scope bound to role and key prefix. | "P11" |
| P12 | Every chef list/detail call writes `chef.memory_viewed` with the memory ids. | "P12" |
| P13 | This document. | "P13" |

## Retention

| Data | Kept until |
|---|---|
| Raw export zip | Detection finishes (never more than 24 h) |
| Food crops, memories, moments, menus | 30 days after the wedding, withdrawal, or caterer deletion |
| Places / enrichments (public venue data) | While any moment links to them |
| Audit log (ids, counts, provider request ids; no content) | Kept as the record of processing and deletion |
