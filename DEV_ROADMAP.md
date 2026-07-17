# Dev Roadmap — PWA Studio

## Phase 1: Foundation ✅
- [x] pnpm monorepo scaffold (Pro + Mobile)
- [x] PostgreSQL + Drizzle ORM schema
- [x] Express API servers (Pro: 9 routes, Mobile: 10 routes)
- [x] OpenAI integration
- [x] Widget registry system
- [x] Multi-agent system
- [x] Real-time SSE events
- [x] GitHub integration
- [x] Kanban board API
- [x] Canvas snapshots
- [x] React/Vite frontend (Pro: 7 pages)
- [x] Expo React Native mobile app (5 screens)
- [x] UI library + mockup sandbox
- [x] Database seed data

## Phase 2: Frontend-Backend Integration
- [ ] Wire API client hooks to all frontend pages (Pro + Mobile)
- [ ] Project CRUD UI
- [ ] Error handling + toast notifications
- [ ] Loading states + optimistic updates

## Phase 3: Pro Features
- [ ] Widget registry UI (browse, install, configure)
- [ ] Studio canvas editor (visual drag-and-drop)
- [ ] Studio flow (step-by-step PWA creation wizard)
- [ ] Layout editor
- [ ] AI chat UI
- [ ] PWA import UI (zip upload + feature detection)
- [ ] Settings page (LLM config)

## Phase 4: Mobile Features
- [ ] Kanban board UI (drag-and-drop)
- [ ] Canvas editor UI
- [ ] Agent status dashboard
- [ ] GitHub repo creation flow
- [ ] Project detail view
- [ ] Real-time event handling

## Phase 5: Polish & Deploy
- [ ] Authentication
- [ ] Database migrations
- [ ] E2E tests
- [ ] Performance optimization
- [ ] Deployment pipeline

## 2026-07-17 (evening) — Deploy reconciliation
- Redeployed to prod after crash left URL at 404. `vercel deploy --prod --yes` → pwa-studio-pi.vercel.app now HTTP 200. Orchestrator-only.
