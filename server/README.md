# TestAnalyser backend

Express + Prisma backend to replace the mock data layer. Includes a first-pass scraper for `test.z7i.in` with selector placeholders.

## Setup

```bash
cd server
npm install
copy .env.example .env
npx playwright install
```

Update `DATABASE_URL`, `JWT_SECRET`, and `ENCRYPTION_KEY` in `.env`. The default example uses SQLite (`file:./dev.db`).

```bash
npx prisma migrate dev --name init
npm run dev
```

The API will start on `http://localhost:4000` by default.

## API endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PATCH /api/auth/preferences`
- `GET /api/external`
- `POST /api/external/connect`
- `POST /api/external/sync`
- `GET /api/tests`
- `GET /api/tests/:id`
- `POST /api/tests/:id/answer-key`
- `PATCH /api/tests/:id/questions/:questionId/bookmarks`

## Scraper notes

The scraper uses Playwright to log in through the UI and discover test pages from the student area.

Exams are stored once globally (shared across users). Syncing an account adds or updates that user's attempt data without re-scraping questions when the exam already exists.

If tests are not discovered or questions do not parse:

1. Set `SCRAPER_DEBUG_DIR=./.scraper` in `.env`.
2. Trigger a sync (`POST /api/external/sync`).
3. Inspect the saved HTML in `server/.scraper` and update selectors in `server/src/scraper/testZ7iScraper.ts`.

If the account requires a verification code, include it in the sync payload as `verificationCode`.

If you need to record the login flow, run:

```bash
cd server
npx playwright codegen https://test.z7i.in
```

Then follow the UI steps; Playwright will generate selectors you can share.

## Inspecting results pages

To snapshot the "My Results" page via Playwright:

```bash
cd server
$env:TEST_Z7I_USERNAME="your_username"
$env:TEST_Z7I_PASSWORD="your_password"
$env:TEST_Z7I_OTP="optional_otp"
node --loader tsx scripts/snapshotResults.ts
```

The HTML is saved to `server/.scraper/results.html`.

To capture HTML at each report step (results -> report -> tabs -> solution subjects):

```bash
cd server
$env:TEST_Z7I_USERNAME="your_username"
$env:TEST_Z7I_PASSWORD="your_password"
$env:TEST_Z7I_OTP="optional_otp"
node --loader tsx scripts/captureReportSteps.ts
```

The HTML files are saved to `server/.scraper`.

## Security

External account passwords are encrypted at rest using `ENCRYPTION_KEY` (AES-256-GCM). Use a 32-byte base64 or hex key.
