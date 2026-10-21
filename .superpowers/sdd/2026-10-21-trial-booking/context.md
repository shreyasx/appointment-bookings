<!-- shared context for every task: the plan's header, global constraints, review focus and file map. Task requirements live in each task brief. -->
# Trial Class Booking Implementation Plan


**Goal:** A web app where a US or UK parent books a free trial class, the system assigns an available mentor in India, and both sides see the time in their own zone. It never overbooks a mentor and never shows a misleading time.

**Architecture:** One package and one Docker Compose stack.
- **Server:** Express 5 serves a small JSON API and the built React app. Postgres enforces the booking rules: a row lock per mentor plus a partial unique index.
- **Shared time module:** one dependency-free `Intl`-only file used by both server and browser, so the UI and the emails format time identically.
- **Browser:** gets a flat list of UTC instants and groups them into the parent's local days.

**Tech Stack:**
- Node (server TypeScript runs via Node's type stripping), Express 5, Zod 4, `pg`, nodemailer, Postgres 17, Mailpit.
- React with Vite, TanStack Query, Tailwind CSS v4.
- Vitest and supertest.

**Spec:** `docs/superpowers/specs/2026-10-20-trial-booking-design.md`. Read it first. Section numbers below (§6, §7, §10) refer to it.

## Global Constraints

- **Runtimes:**
  - Node ≥ 22.18 locally, where TypeScript type stripping is on by default.
  - Docker images: `node:24-alpine` and `postgres:17-alpine`, plus `axllent/mailpit:v1.31.6`.
- **Dependencies:**
  - Runtime: `express@5`, `pg`, `zod@4`, `nodemailer`.
  - Dev: `typescript`, `vitest`, `supertest`, `vite`, `@vitejs/plugin-react`, `react`, `react-dom`, `@tanstack/react-query`, `tailwindcss@4`, `@tailwindcss/vite`, and their `@types/*`.
  - Nothing else: no date library, ORM, router, component library or CSS-in-JS.
- **TypeScript:**
  - Erasable syntax only (`erasableSyntaxOnly`): no `enum`, no namespaces, no parameter properties.
  - Relative imports carry their `.ts`/`.tsx` extension, and type-only imports use `import type`.
- **Time:**
  - Never use local-time `Date` methods: `getHours`, `getDate`, `getDay`, `setHours`, `new Date(y, m, d)`, or `toLocaleString` without a `timeZone`.
  - Use `getTime`, `toISOString`, `Date.UTC`, `getUTC*` on calendar-only values, and `Intl` with an explicit `timeZone`.
- **One clock:**
  - Only `createClock` (Task 7) reads the real time. Pure functions take `now`.
  - SQL never calls `now()` in business queries; `created_at default now()` is the only use.
  - Browser code never reads the device clock for app logic.
- **Domain values:**
  - Classes are 60 minutes and start on the UTC hour.
  - Booking window: 120 minutes ahead at the earliest, 14 days at the latest, both ends inclusive.
  - Cap: 2 active bookings per mentor per calendar day in **the mentor's own time zone**. "Active" means `cancelled_at is null`.
- **Wording:** say "the mentor's own time zone" in code, comments and README, never "IST".
- **Display style everywhere** (UI and emails): `Fri 23 Oct, 4:00 PM BST (London)`, built only from `src/shared/time.ts`.
- **API errors:**
  - Shape: `{ "error": { "code", "message", "fields"? } }`.
  - Codes: `VALIDATION_FAILED` 400, `SLOT_UNAVAILABLE` 409, `NOT_FOUND` 404, `INTERNAL` 500.
  - Every `/api` response sends `Cache-Control: no-store`.
- **Styling:** colours, radii and the shadow come only from the `@theme` tokens in `src/web/index.css` (spec §10). No raw hex values in components.
- **React:**
  - TanStack Query for all server data, and no fetching in `useEffect`.
  - No `useOptimistic`, `useMemo` or `useCallback`.
  - `useId` for every label/input pair.
- **Containers:** every one sets `TZ=UTC`.
- **Commits:**
  - The whole message is lowercase, subject and body, acronyms included.
  - No co-authored-by or other attribution trailer.
  - Add files explicitly. Never commit `.playwright-mcp/`, the assignment PDF, `node_modules/` or `dist/`.
- **Public repository:** no secrets except the repo's own Postgres credentials, `bookings`/`bookings`.
- **Local database:** tests and the dev server default to `postgres://bookings:bookings@localhost:5433/bookings`, the compose `db` service on host port 5433. From Task 3 onwards, `npm test` needs `docker compose up -d db` running.

## Review Focus

1. **Double-clicking "Confirm"** must create one booking, not two with different mentors. The button is disabled while the booking request is pending and after it succeeds, until the page unloads (Task 11 check).
2. **Changing the time zone after picking a time** must keep that time selected and show the day it falls on in the new zone (Task 9 test on `shownDayKey`).
3. **Names that are only spaces, or contain line breaks or other control characters**, would otherwise reach email subjects. They get a 400 with field errors (Task 7 test).
4. **A zone that ICU spells differently from the list** (`Asia/Kolkata` vs `Asia/Calcutta`). The select must show exactly one Kolkata option, and its value must equal the current zone, or the select goes blank (Task 9 test on `zoneOptions`).
5. **A class that straddles a clock change.** A London class at 1:00 AM BST ends at 1:00 AM GMT, so its span must read "1:00 AM BST–1:00 AM GMT (London)", never "1:00–1:00 AM" (Task 2 test on `formatSpan`).

## File map

| Path | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts` | scripts, compiler rules, Vite + Vitest config |
| `docker-compose.yml`, `Dockerfile`, `.dockerignore` | the stack: `db`, `mailpit`, `app`, `test` |
| `migrations/001_init.sql` | schema (spec §11, verbatim) |
| `src/shared/time.ts` | every time-zone conversion and display format |
| `src/shared/types.ts` | API request/response types shared by server and web |
| `src/server/db.ts` | pool (with the `date` parser) and the migration runner |
| `src/server/test-db.ts` | test-only helpers: a throwaway database per test file, `insertMentor` |
| `src/server/slots.ts` | pure slot rules: working hours → class starts, availability |
| `src/server/bookings.ts` | data access and the `bookSlot` transaction |
| `src/server/email.ts` | pure email rendering and the SMTP mailer |
| `src/server/app.ts` | `createClock`, `createApp`: routes, validation, error middleware, static files |
| `src/server/seed.ts` | 10 mentors, their hours, pre-booked classes |
| `src/server/main.ts` | entry: migrate → seed → listen |
| `src/web/booking.ts` | pure browser logic: day grouping, nearest alternatives, zone options, the flow reducer |
| `src/web/api.ts`, `src/web/hooks.ts` | typed fetch client; `useTimeZone`, `useSlots`, `useBookSlot` |
| `src/web/ui.tsx` | small shared pieces: `Card`, `CardTitle`, `Progress`, `DemoBanner` |
| `src/web/App.tsx`, `main.tsx`, `index.css`, `index.html` | shell, path switch, `@theme`, entry |
| `src/web/BookingPage.tsx`, `ConfirmationPage.tsx`, `MentorsPage.tsx` | the three pages |
| `README.md` | submission docs (`TRANSCRIPT.md` is added by the author at the end, outside this plan) |

