# PWA Studio

Self-hosted visual development environment for building modular PWAs and a reusable
"Widget OS" system. Canvas-based editor with AI-assisted development, widget registry,
and a mobile companion app.

## Repository layout

This is a **pnpm monorepo** with two independent sub-projects (each is its own
pnpm workspace — there is no single root workspace file).

```
20.12_PWA_STUDIO/
├── 02_PWA-Studio-Pro/        # Web app (React/Vite + Express API)
│   ├── artifacts/
│   │   ├── studio/           # React 19 + Vite frontend (7 pages, shadcn UI)
│   │   └── api-server/       # Express 5 API (9 routes) + Drizzle ORM
│   └── lib/
│       ├── db/               # Drizzle schema + migrations (PostgreSQL)
│       ├── api-spec/         # OpenAPI YAML
│       ├── api-zod/          # Generated Zod schemas
│       └── api-client-react/ # Generated React Query hooks
├── 03_PWA-Studio-mobile/     # Expo React Native app + companion API
│   ├── artifacts/
│   │   ├── app-studio-mobile/# Expo app (tabs: home, kanban, canvas, settings)
│   │   └── api-server/        # Express API (10 routes) + Drizzle ORM
│   └── lib/                  # db / api-spec / api-zod / api-client-react
├── vercel.json               # Vercel deploy config for the Pro frontend
└── AGENT_NOTES.md            # Architecture + pitfalls
```

## Requirements

- **Node.js 22+** (Vite 7 / Expo 54 require Node 20.19+/22.12+; system default 18 is too old)
- pnpm 9+
- PostgreSQL 16+

Activate Node 22 via nvm:

```bash
nvm use 22
```

## Web (Pro)

```bash
cd 02_PWA-Studio-Pro
pnpm install

# Database (apply migrations)
cd lib/db && pnpm run migrate && cd ../..   # needs DATABASE_URL in env

# API server (Terminal 1)
cd artifacts/api-server && cp .env.example .env && pnpm run dev

# Frontend (Terminal 2)
cd artifacts/studio && pnpm run dev         # http://localhost:3000
```

The frontend calls the API at same-origin `/api/*`. To point it at a remote API
(e.g. on a Vercel-only frontend deploy), set `VITE_API_BASE_URL` (see `vercel.json`).

### Build

```bash
cd 02_PWA-Studio-Pro
pnpm --filter @workspace/studio run build   # -> artifacts/studio/dist/public
pnpm --filter @workspace/api-server run build # -> artifacts/api-server/dist
```

## Mobile (Expo)

```bash
cd 03_PWA-Studio-mobile
pnpm install
cd artifacts/app-studio-mobile
pnpm exec expo start        # Metro dev server
```

Production static export is produced by `pnpm run build` (scripts/build.js), which
downloads the iOS/Android bundles + manifests from a running Metro instance.

## Deploy — Pro frontend on Vercel

`vercel.json` at the repo root is configured for the Pro `studio` frontend:

- **Build:** `cd 02_PWA-Studio-Pro && pnpm install && pnpm --filter @workspace/studio run build`
- **Output:** `02_PWA-Studio-Pro/artifacts/studio/dist/public`
- **SPA rewrites:** all non-asset routes fall back to `index.html`
- **Env:** set `VITE_API_BASE_URL` (project env / env var `pwa-studio-api-url`) to the
  URL of a hosted API server. Without it the SPA expects the API at same origin.

```bash
vercel link
vercel env add VITE_API_BASE_URL    # value: https://your-api-host.example
vercel --prod
```

> The API server itself is a stateful Node service (PostgreSQL + drizzle). Deploy it
> separately (Railway, Render, Fly, a VM) — Vercel serverless functions are not a
> drop-in for this Express+Drizzle backend. Wire it via `VITE_API_BASE_URL`.

## Environment variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | API (Pro + Mobile) | PostgreSQL connection string |
| `PORT` | API | Express listen port |
| `OPENAI_API_KEY` | Pro API | AI chat (optional) |
| `OPENAI_BASE_URL` | Pro API | OpenAI-compatible endpoint (SSRF-guarded) |
| `GITHUB_TOKEN` | Mobile API | Director / GitHub routes (optional) |
| `CLERK_*` | Mobile | Clerk auth (optional, unused by default) |
| `VITE_API_BASE_URL` | Pro frontend | Remote API base URL (optional) |

## Notes

- Authentication, real-time SSE, and the Kanban/canvas UIs are partially implemented
  (see AGENT_NOTES.md / DEV_ROADMAP.md).
- This project was originally scaffolded on Replit; all `@replit/*` dev dependencies
  and Replit-specific config have been removed.
