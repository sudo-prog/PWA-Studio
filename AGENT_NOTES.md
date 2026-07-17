# Agent Notes — PWA Studio
**Last updated:** 2026-06-24
**Status:** Code + DB + migrations pushed to GitHub (`sudo-prog/PWA-Studio`, branch: master). API runtime debugging pending.

---

## Project Overview

Self-hosted visual development environment for building modular PWAs and a reusable "Widget OS" system. Canvas-based editor with AI-assisted development, widget registry, and mobile companion app. Two sub-projects: Pro (web) and Mobile (Expo React Native).

- **Stack:** pnpm monorepo, Node.js 24, TypeScript 5.9, Express 5, React 19, Vite, PostgreSQL, Drizzle ORM, Expo mobile, OpenAI
- **Sub-projects:** 02_PWA-Studio-Pro (web), 03_PWA-Studio-mobile (Expo)
- **DB tables (Pro):** projects, layouts, widgets (registry), ai_conversations, user_settings
- **DB tables (Mobile):** projects, kanban_columns, kanban_tasks, agent_status, activity_events, canvas_snapshots, app_settings

---

## Architecture

### Pro (Web) — 02_PWA-Studio-Pro
```
artifacts/
  api-server/       — Express API (9 route files)
  studio/           — React/Vite frontend (7 pages)
  mockup-sandbox/   — UI component sandbox
lib/
  api-spec/         — OpenAPI YAML spec
  api-zod/          — Generated Zod schemas
  api-client-react/ — Generated React Query hooks
  db/               — Drizzle ORM schema (5 tables)
```

#### Pro API Routes (9 files)
| Route | Key Endpoints |
|-------|---------------|
| `/api/healthz` | GET health check |
| `/api/projects` | GET list (with layout/widget counts), POST create, GET :id, PATCH :id, DELETE :id |
| `/api/layouts` | GET list, POST create, GET :id, PATCH :id, DELETE :id |
| `/api/widgets/registry` | GET list, POST register (slug, name, version, schema, tags) |
| `/api/conversations` | GET paginated, POST create, POST send message (OpenAI streaming) |
| `/api/dashboard` | GET summary |
| `/api/settings` | GET, PATCH |
| `/api/import` | POST import PWA from zip (AdmZip, feature detection) |
| `/seed` | Database seeding (built-in widgets, sample projects) |

#### Pro Frontend Pages (7)
Dashboard, Projects, Studio, StudioFlow, Widgets, Settings, NotFound

#### Pro Key Features
- **Widget OS** — register, browse, and instantiate widgets from a registry
- **Layout management** — save/restore layout snapshots
- **AI conversations** — OpenAI chat with SSRF guard (only http/https allowed)
- **PWA import** — upload zip, auto-detect features (auth, cart, map, chat, dashboard, etc.)
- **Seed data** — built-in widgets (clock, weather, notes, etc.)

### Mobile (Expo) — 03_PWA-Studio-mobile
```
artifacts/
  api-server/       — Express API (10 route files)
  app-studio-mobile/ — Expo React Native app
  app-studio/       — Additional web studio
  mockup-sandbox/   — UI component sandbox
```

#### Mobile API Routes (10 files)
| Route | Key Endpoints |
|-------|---------------|
| `/api/healthz` | GET health check |
| `/api/projects` | CRUD + list with kanban/agent counts |
| `/api/kanban` | Full CRUD (columns, tasks, reorder) |
| `/api/agents` | GET status, PATCH status per agent role |
| `/api/director` | GitHub file read/push, agent orchestration |
| `/api/canvas` | GET/PUT canvas snapshots |
| `/api/settings` | GET, PATCH (LLM config) |
| `/api/dashboard` | GET summary |
| `/api/sse` | Server-Sent Events stream (real-time project events) |
| `/api/github` | GitHub repo operations (create, push, templates) |

#### Mobile App Routes (Expo)
- Tabs: index (home), kanban, canvas, settings
- Root: _layout, +not-found
- Project: project/[id]

#### Mobile Key Features
- **Multi-agent system** — agent status tracking per project role
- **Real-time SSE** — Server-Sent Events for live project updates
- **GitHub integration** — read/push files, template-based repo creation
- **Kanban board** — full drag-and-drop task management
- **Canvas snapshots** — save/restore canvas state
- **Director** — orchestrates agents, reads/pushes GitHub files

---

## Development Roadmap

### Completed
- [x] pnpm monorepo scaffold (both Pro and Mobile)
- [x] PostgreSQL + Drizzle ORM schema (5+ tables each)
- [x] Express API servers (Pro: 9 routes, Mobile: 10 routes)
- [x] OpenAI integration (Pro: chat, Mobile: settings)
- [x] Widget registry system (Pro)
- [x] PWA import from zip with feature detection (Pro)
- [x] Multi-agent system (Mobile)
- [x] Real-time SSE events (Mobile)
- [x] GitHub integration (Mobile: read/push/templates)
- [x] Kanban board API (Mobile)
- [x] Canvas snapshots (Mobile)
- [x] React/Vite frontend (Pro: 7 pages)
- [x] Expo React Native mobile app (Mobile: 5 screens)
- [x] Wouter routing, React Query
- [x] Tailwind CSS v4 + shadcn UI library
- [x] Database seed data

### In Progress / Not Yet Built
- [ ] Frontend-backend integration (API client hooks → pages)
- [ ] Project CRUD UI (Pro + Mobile)
- [ ] Widget registry UI (browse, install, configure)
- [ ] Studio canvas editor (visual drag-and-drop)
- [ ] Studio flow (step-by-step PWA creation wizard)
- [ ] Layout editor
- [ ] AI chat UI
- [ ] Kanban board UI (drag-and-drop)
- [ ] Canvas editor UI
- [ ] Agent status dashboard
- [ ] GitHub repo creation flow
- [ ] PWA import UI
- [ ] Settings page (LLM config)
- [ ] Database migrations
- [ ] Authentication
- [ ] Deployment pipeline
- [ ] E2E tests

### Known Issues
- pnpm-workspace.yaml has Replit-specific packages
- OpenAI API key required for chat features
- GitHub token required for mobile features
- SSE requires keep-alive heartbeats (20s interval)
- Mobile app needs Expo dev client for testing
- `ensureSettings` creates default settings row if missing

---

## Common Pitfalls
- **Drizzle numeric columns** returned as `string` — always cast
- **SSE connections** — must send heartbeat every 20s to prevent proxy timeout
- **EventBus** — in-memory only, doesn't persist across restarts
- **Widget schema** — stored as JSONB, validate before use
- **PWA import** — AdmZip loads entire zip into memory (50MB limit)
- **OpenAI SSRF guard** — only http/https URLs allowed for LLM base URL
- **Mobile Expo** — requires `expo start` with metro bundler
- **API client hooks** — run codegen after schema changes

---

## File Reference
### Pro (Web)
| Path | Purpose |
|------|---------|
| `02_PWA-Studio-Pro/artifacts/api-server/src/routes/projects.ts` | Project CRUD |
| `02_PWA-Studio-Pro/artifacts/api-server/src/routes/widgets.ts` | Widget registry |
| `02_PWA-Studio-Pro/artifacts/api-server/src/routes/conversations.ts` | OpenAI chat |
| `02_PWA-Studio-Pro/artifacts/api-server/src/routes/import.ts` | PWA zip import |
| `02_PWA-Studio-Pro/artifacts/api-server/src/seed.ts` | Database seeding |
| `02_PWA-Studio-Pro/artifacts/studio/src/pages/studio.tsx` | Main studio page |
| `02_PWA-Studio-Pro/artifacts/studio/src/pages/studio-flow.tsx` | PWA creation flow |

### Mobile (Expo)
| Path | Purpose |
|------|---------|
| `03_PWA-Studio-mobile/artifacts/api-server/src/routes/agents.ts` | Agent status |
| `03_PWA-Studio-mobile/artifacts/api-server/src/routes/director.ts` | Agent orchestration + GitHub |
| `03_PWA-Studio-mobile/artifacts/api-server/src/routes/sse.ts` | Real-time events |
| `03_PWA-Studio-mobile/artifacts/api-server/src/routes/github.ts` | GitHub operations |
| `03_PWA-Studio-mobile/artifacts/api-server/src/routes/kanban.ts` | Kanban CRUD |
| `03_PWA-Studio-mobile/artifacts/api-server/src/lib/eventBus.ts` | In-memory event bus |
| `03_PWA-Studio-mobile/artifacts/app-studio-mobile/app/(tabs)/` | Tab screens |
| `03_PWA-Studio-mobile/artifacts/app-studio-mobile/app/project/[id].tsx` | Project detail |

## Mobile UI Compliance (MOBILE-UI-STANDARD.md)
- **Status:** PASS (live: pwa-studio-pi.vercel.app; FAILING=0 on all 7 routes @390x844)
- **Verified:** 2026-07-17 via per-element Playwright harness (_verify_mobile.cjs, mobile-ui-standards-bible §2) against LIVE prod url.
  Gate = docOverflow<=2, realOff===0, consoleErrs===0, smallTaps===0 — all routes green.
- **T-1 fix:** index.css enforces 44x44px on touch/coarse + <=767px; inline `<a href>` promoted to inline-flex so the min-height actually applies to body links (back links, "open in new tab", empty-state CTAs).
- **Console fix:** API queries (widgets/settings/studio/studio-flow/AI chat) gated behind `import.meta.env.DEV || VITE_API_ENABLED==='true'` so no /api/* 404s fire on the static Vercel deploy. Dashboard/projects already gated.
- **Commit:** 0dc15d6 (fixes) -> dbb0449 (harness cleanup); pushed to master.
