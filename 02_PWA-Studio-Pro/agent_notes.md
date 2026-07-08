# Agent Notes — PWA Studio

## Audit History
- 2026-07-09: Frontend route audit (chief-of-staff agent)
  - **Routes**: 7 routes (wouter). No auth gate. Frontend = `artifacts/studio` (the Vercel build target; `mockup-sandbox` is NOT deployed).
  - **Bugs found & fixed** (unguarded API data when backend/Postgres down → crashes):
    - `dashboard.tsx:166` — `projects.map` → `Array.isArray` guard
    - `widgets.tsx:89` — `widgets?.filter` → `Array.isArray` guard + null-safe fields
    - `projects.tsx:168,184` — `projects?.map` guard + `new Date(updatedAt)` guard
    - `settings.tsx:73-78` — `form.reset` with `??` fallbacks for theme/activeModel/llmApiKey (controlled→uncontrolled warning)
    - `studio.tsx:398,492,768,978,270` — `registryWidgets`/`layouts`/`widgets`/`messages` `.map`/`.find`/`.filter` all guarded with `Array.isArray`
  - **Result**: all 7 routes now render gracefully (empty states) with 0 console/page errors when API is down. Previously `/dashboard`, `/studio/1`, `/widgets` crashed with `X is not a function` / `Invalid time value`.
  - **Build**: `cd artifacts/studio && pnpm build` passes (vite 7.3.3, 6.66s, dist/public + PWA service worker).
  - **Verdict**: UI now robust against missing/non-array API responses. No data-dependent content without backend (Postgres required), but no crashes.
