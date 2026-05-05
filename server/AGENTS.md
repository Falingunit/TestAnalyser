# Backend Agent Notes

This directory contains the Express + Prisma backend for TestAnalyser.

## Scope

- API routes: `src/routes/`
- Auth and middleware: `src/auth/`, `src/middleware/`
- Prisma setup: `prisma/`
- Utility scripts: `scripts/`

## Common Commands

Run from `server/`:

```bash
npm install
npm run dev
npm run build
npx prisma generate
npx prisma migrate dev --name <name>
npx prisma migrate deploy
```

Useful scripts:

```bash
npm run reset:db
npm run fetch:questionwise
```

## Data and Prisma

- Default local database is SQLite via `DATABASE_URL=file:./dev.db`.
- Keep `@prisma/client` and `prisma` versions aligned.
- If schema changes, regenerate Prisma client and verify the app still builds.

## Scraper / Playwright

- Playwright is used for the `test.z7i.in` integration.
- Debug scraper output goes under `server/.scraper` when enabled.
- If the scraper or sync flow changes, preserve current credential-handling behavior and avoid logging secrets.

## API Expectations

- User preferences are normalized in `src/routes/auth.ts`.
- Test sync, answer key, and community-related behavior live under `src/routes/tests.ts`.
- Changes that alter serialized response shapes should be checked against frontend consumers in `src/lib/store.tsx` and page-level loaders.

## Verification Expectations

Before finishing backend work, run:

```bash
npm run build
```

If you changed Prisma schema or migrations, also run:

```bash
npx prisma generate
```

## Safety Notes

- Do not commit real credentials in `.env`.
- Treat `ENCRYPTION_KEY` and synced external-account credentials as sensitive.
- Be careful with scripts that mutate local DB state; prefer explicit commands over automatic resets.
