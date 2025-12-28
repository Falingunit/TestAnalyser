# TestAnalyser

Test analysis app with a Vite + React frontend and an Express + Prisma backend.

## Stack

- Frontend: Vite, React, shadcn UI, Tailwind
- Backend: Express, Prisma (SQLite by default)

## Requirements

- Node.js 18+
- npm
- Optional: Playwright browsers for the scraper

## Environment files

Frontend (repo root):

```bash
cp .env.example .env
```

Variables:

- `VITE_API_BASE_URL`: preferred API base URL (used by `src/lib/api.ts`).
- `VITE_API_URL`: legacy fallback used by `src/api.ts`.

Backend (`server`):

```bash
cp server/.env.example server/.env
```

Variables:

- `DATABASE_URL`: Prisma connection string (SQLite example: `file:./dev.db`).
- `JWT_SECRET`: long random secret for signing auth tokens.
- `ENCRYPTION_KEY`: 32-byte key (base64, hex, or raw) for credential encryption.
- `PORT`: API port (default `4000`).
- `SERVER_HOST`: bind host (default `0.0.0.0`).
- `CORS_ORIGIN`: comma-separated list of allowed frontend origins.
- `SCRAPER_*`: scraper runtime settings.
- `TEST_Z7I_*`: credentials for the Playwright helper scripts.

## Localhost development (testing)

1) Install dependencies.

```bash
npm install
cd server
npm install
```

2) Configure env files (see above).

3) Run Prisma migrations.

```bash
cd server
npx prisma migrate dev --name init
```

4) Optional: install Playwright browsers if you plan to run the scraper.

```bash
cd server
npx playwright install
```

5) Start the API.

```bash
cd server
npm run dev
```

6) Start the frontend (new terminal).

```bash
npm run dev
```

7) Open the app at `http://localhost:5173`.

## Production

Backend:

```bash
cd server
npm install
npm run build
npx prisma migrate deploy
npm run start
```

Frontend:

```bash
npm install
npm run build
```

Serve `dist/` with your preferred static host (NGINX, Vercel, Netlify, etc). For a local production preview, run `npm run preview`.

Production checklist:

- Set `VITE_API_BASE_URL` (and/or `VITE_API_URL`) to your public API URL before building the frontend.
- Set `CORS_ORIGIN` to the production frontend URL(s).
- Provide secure `JWT_SECRET` and `ENCRYPTION_KEY` values.