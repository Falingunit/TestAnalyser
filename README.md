# TestAnalyser

React + shadcn UI app for deeper test analysis on test.z7i.in data. This build ships with a local mock data layer so the UX can be reviewed before wiring a backend.

## Quick start

```bash
npm install
npm run dev
```

## Demo accounts

- User: `hello@demo.com` / `demo123`
- Admin: `admin@analyser.local` / `admin123`

## Core flows

- Auth flow for TestAnalyser accounts
- External account connect for test.z7i.in (mocked)
- Dashboard with synced tests and latest diagnostic summary
- Tests page with search and filters (score, accuracy)
- Full test analysis with subject performance and question detail
- Question detail view with bookmarking tags
- Bookmarks page for tagged questions
- Admin answer key updates (original vs current only)
- Theme selection and dark mode

## Data notes

- Data is stored in `localStorage` under `testanalyser-state`.
- External account sync is mocked in `src/lib/store.tsx`.
- Seed data is generated in `src/lib/mockData.ts`.
- Analysis logic lives in `src/lib/analysis.ts`.

## Backend integration plan

To replace the mock data with a real backend:

1. Create an API for auth and test storage.
2. Add a secure credential flow or token-based integration for test.z7i.in.
3. Store answer key changes separately and keep both original and current keys.
4. Trigger a sync job to scrape and normalize tests into the schema used here.

Suggested endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/external/connect`
- `POST /api/external/sync`
- `GET /api/tests`
- `GET /api/tests/:id`
- `POST /api/tests/:id/answer-key`

Security note: do not store raw third-party passwords in the client. Use server-side encrypted storage or OAuth-like token exchange if available.
