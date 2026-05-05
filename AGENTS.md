# TestAnalyser Agent Notes

This repository has two active code areas:

- `/` - Vite + React frontend
- `/server` - Express + Prisma backend

Ignore `/_ref`. It is a reference copy, not an active part of the app.

## Working Areas

- Frontend source lives in `src/`.
- Static assets live in `public/`.
- Backend-specific guidance lives in `server/AGENTS.md`.

## Common Commands

From the repo root:

```bash
npm install
npm run dev
npm run build
npm run lint
```

From `server/`:

```bash
npm install
npm run dev
npm run build
npx prisma migrate deploy
npx prisma generate
```

## Environment

Frontend env file:

- `.env`
- `VITE_API_BASE_URL`
- `VITE_API_URL`

Backend env file:

- `server/.env`
- `DATABASE_URL`
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `CORS_ORIGIN`

## Frontend Conventions

- TypeScript is strict enough that quick `any` patches usually cause follow-up cleanup. Prefer explicit local types.
- Path alias `@/*` maps to `src/*`.
- The app uses React Router and store-driven state in `src/lib/store.tsx`.
- UI components mostly come from the local `src/components/ui/` layer.
- If you change question/test flows, check both `src/pages/TestDetail.tsx` and `src/pages/QuestionDetail.tsx`.

## Verification Expectations

For frontend changes, run:

```bash
npm run lint
npm run build
```

For backend changes, run:

```bash
cd server
npm run build
```

If a change crosses frontend/backend boundaries, run all three.

## Deployment Notes

- GitHub Pages deploy is handled by `.github/workflows/pages.yaml`.
- Pages auto-deploys on pushes to `master` when `server/**` is unchanged.
- Server changes do not trigger the Pages deploy workflow.

## Known Constraints

- `vite-plugin-pwa@1.2.0` is currently compatible with Vite 7 in this repo. Do not bump Vite to 8 without resolving that compatibility first.
- Large refactors around hooks can trigger stricter React Hooks lint rules. Keep handler dependencies stable and avoid synchronous state writes inside effects unless you intentionally refactor the surrounding flow.
