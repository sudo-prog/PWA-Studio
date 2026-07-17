# Agent Notes — PWA Studio

Architecture decisions, file structure, API patterns, and known issues.

---

## Project Path
`/home/thinkpad/Data/20_Projects/20.12_PWA_STUDIO/03_PWA-Studio-mobile/`

## Repository
- GitHub: `sudo-prog/PWA-Studio` (private)
- Main branch: `main`
- pnpm monorepo with workspaces

## Monorepo Structure
- `artifacts/app-studio-mobile/` — Expo mobile app (React Native 0.81, expo-router, Clerk auth)
- `artifacts/api-server/` — Express 5 backend (Drizzle ORM, PostgreSQL, SSE, GitHub integration)
- `lib/db/` — Shared database schema (Drizzle), migrations
- `lib/api-zod/` — Shared Zod schemas, API client
- `lib/api-client-react/` — Generated API client for frontend

## Key Technologies
- Mobile: React Native 0.81, Expo 54, expo-router, Reanimated 4, Clerk authentication
- Backend: Express 5, Drizzle ORM, PostgreSQL, SSE streaming, GitHub API integration
- Features: Kanban board, canvas editing, project management, GitHub templates
- Offline: TanStack Query persist client with AsyncStorage

## Vercel Deployment Configuration
- No direct Vercel deployment for this project
- Deployed as Expo mobile app via EAS Build

## Audit Fixes (2026-07-05)

### API Client Base URL Wiring
- `artifacts/app-studio-mobile/app/_layout.tsx` — Already has `setBaseUrl` with `EXPO_PUBLIC_DOMAIN` configured correctly.

### Mobile / Touch Support
- Full React Native gesture handler integration
- Reanimated animations throughout
- Safe area provider for notched devices
- SSE for real-time updates

### AI Integration
- No explicit AI features in this project
- Uses TanStack Query for all data fetching

### Known Issues
- Requires `EXPO_PUBLIC_DOMAIN` environment variable
- PostgreSQL required for full functionality
- SSE connections require proper CORS configuration

---

## Deployment Checklist
- [ ] Set `EXPO_PUBLIC_DOMAIN` in Expo environment
- [ ] Apply database migrations (`pnpm db:push` or direct SQL)
- [ ] Configure Clerk keys for authentication

## Deploy Reconciliation — 2026-07-17 (night, post 17:13 CPU-spike force-reset)
- This mobile sub-project (Expo app) was part of the 6-project mobile-std audit. After the CPU-spike force-reset, the orchestrator reconciled: the mobile-std kanban tasks were CODE-complete + committed + pushed; 3 web live URLs (WWW/PWA/DESIGN) had gone 404 from stale deploys and were redeployed via `vercel deploy --prod --yes` (REMOTE build, zero local RAM) — all back to HTTP 200. No crash. This Expo mobile app is built via EAS, not Vercel web deploy. Full detail in chief-of-staff OPS_LOG.md.