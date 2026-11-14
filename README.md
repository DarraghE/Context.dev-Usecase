# Wedding Food Memory

Turns a consenting couple's own Instagram, Facebook and Google Photos exports into a ranked timeline of the meals that mattered to them — the proposal, the first date, the trip — so the caterer's chef can design a wedding menu around those moments. Sold by caterers as an add-on to a wedding catering package.

**Context.dev** is what turns a geotag into a dish: it finds each restaurant's official website (Answers), lists the site's pages to find the menu (Map), reads the menu into structured JSON with page images (Scrape: `json`, `images`, `links` parser, PDF OCR), and batches many venues at once (Batches). **Claude** finds food in photos, reads captions for life events, identifies venues from coordinates (web search), matches the photographed dish to the scraped menu, and drafts the menu.

Built to [`BUILD_SPEC.md`](BUILD_SPEC.md). Choices and VERIFY results: [`docs/decisions.md`](docs/decisions.md). Privacy: [`docs/privacy.md`](docs/privacy.md).

## Run it (offline demo, no API keys)

```bash
npm install
cp .env.example .env
npm run setup
npm run dev
```

Then open http://localhost:3000 and click **Open the caterer demo**. `.env.example` runs in replay mode (`DEMO_REPLAY=1`): recorded Context.dev responses and replayed Claude outputs, so the demo is free and works offline. Change `SESSION_SECRET` before deploying anywhere.

For live mode set `DEMO_REPLAY=0`, `ANTHROPIC_API_KEY` and `CONTEXT_DEV_API_KEY`.

## Demo script (§12)

Each person signs in with their own single-use link. Sessions are per browser, so use a private window (or another browser) for each person.

1. **Caterer** → *New booking* (pre-filled with the synthetic couple Aino & Sam, 1 nut allergy, 2 vegans) → invite links appear on screen.
2. **Aino** (partner A link) → consent → upload `fixtures/exports/aino_instagram.zip` (drop it, or *Use Aino's Instagram export*) → processing → review: approve *Eton mess*, hide one.
3. **Sam** (partner B link) → consent → *Use Sam's Google Takeout* → the hospital pea soup is *hidden by default*; approve *Salmon soup* and the pizzas.
4. **Chef** → the ranked list starts with the proposal Eton mess → open *Salmon soup*: Löyly's current menu, the match "JASPER´S SALMON SOUP", source link and scrape date → *Menu builder* → *Draft the menu*: the dessert cites the proposal memory, has a vegan variant and no nuts (the allergy check regenerates a pistachio course once).
5. **Caterer** → booking status: counts only, and *Delete booking data* behind a typed confirmation.

## Tests

```bash
npm test
```
```bash
npm run test:e2e
```

- `npm test` (vitest, replay mode): the pipeline acceptance checks on the demo set (§13), one test per privacy rule P1–P13, parsers for every export variant, Context.dev contract + 402/429/408 handling, menu allergen validation, auth and route guards, scoring.
- `npm run test:e2e` (Playwright): the full demo script through the UI, including a real resumable tus upload. Run `npx playwright install chromium` once first. Stop any other `next dev` in this folder first (Next.js allows one per project).
- `LIVE=1 npm test` adds the live Context.dev smoke test. `npm run test:accuracy` runs food detection live on the demo set (needs `ANTHROPIC_API_KEY`, costs money) and checks recall ≥ 90% / false positives ≤ 5%.

## Scripts

| Command | What |
|---|---|
| `npm run fixtures` | Rebuild the synthetic exports (`fixtures/exports/`) and Claude replays |
| `npm run seed` | Migrate, seed the demo caterer, print a caterer sign-in link (`-- --booking` also creates the couple) |
| `npm run deletion:run` | Run the P9 deletion job now (it also runs daily in-process) |
| `npm run replay:record` | Re-record every replay from the live APIs |
| `npm run test:accuracy` | Live detection accuracy + AC4 timing |

## Layout

```
src/app/            pages (caterer, partner, chef) and API route handlers (§8)
src/proxy.ts        runs src/privacy/guards.ts before every request (single role check)
src/db/schema.ts    Drizzle schema (§6), SQLite via libsql; drizzle/ has the migration
src/pipeline/       one file per stage (§7) + the resumable job runner
src/parsers/        instagram.ts, facebook.ts, google_takeout.ts, mojibake repair
src/integrations/   claude.ts, contextdev.ts, replay store
src/prompts/        versioned prompt files
src/privacy/        consent, deletion, face blur, signed media, guards, sessions
src/scoring/        significance formula and weights
scripts/            seed-demo.ts, fixture painter/builder, live and deletion scripts
fixtures/           replays (contextdev.json is live data), manifest (test oracle)
tests/, e2e/        vitest and Playwright
```

## Production notes

Same schema on Postgres; BullMQ + Redis behind the same job interface; S3-compatible storage in an EU region (same key layout as `storage/`); tus → S3 multipart (`@tus/s3-store`); email delivery of invite links. See `docs/decisions.md` for open items.
