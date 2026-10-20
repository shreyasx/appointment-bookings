# Trial Class Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

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

## Before you start (main session, once)

The repository has no commits yet.
1. Create `.gitignore` containing `node_modules/`, `dist/`, `.playwright-mcp/`, `.superpowers/`, `*.log` and `.DS_Store`.
2. Commit `.gitignore` and `docs/` to `main` as the first commit: `docs: add trial booking design and implementation plan`.
3. All tasks below commit straight to `main` (the author's call: no feature branch).

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

---

### Task 1: Project scaffold and time conversions

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `src/shared/time.ts`, `src/shared/time.test.ts` (plus the generated `package-lock.json`)

**Interfaces:**
- Consumes: nothing.
- Produces (`src/shared/time.ts`):
  - `isValidTimeZone(tz: string): boolean`
  - `offsetMinutes(at: Date, tz: string): number` (UTC offset in minutes, e.g. `-240`, `330`)
  - `localDate(at: Date, tz: string): string` (`'YYYY-MM-DD'`)
  - `weekdayOf(date: string): number` (0 = Sunday)
  - `addDays(date: string, days: number): string`
  - `zonedTimeToInstant(date: string, time: string, tz: string): Date` (`time` is `'HH:MM'` or `'HH:MM:SS'`)

- [ ] **Step 1: Create the project files.** `npm init -y`, then:
  - `package.json`: `"type": "module"`, `"private": true`, `"engines": { "node": ">=22.18" }`, and the scripts
    `"test": "TZ=UTC vitest run && TZ=Pacific/Chatham vitest run && TZ=America/Los_Angeles vitest run"` and `"typecheck": "tsc"`.
  - Install dev dependencies `typescript vitest @types/node`.
  - `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "types": ["node"]
  },
  "include": ["src", "vite.config.ts"]
}
```

  - `vite.config.ts`: `import { defineConfig } from 'vitest/config'; export default defineConfig({ test: { testTimeout: 20_000, hookTimeout: 20_000 } });`

- [ ] **Step 2: Write the failing tests** in `src/shared/time.test.ts`

```ts
import { expect, test } from 'vitest';
import { addDays, isValidTimeZone, localDate, offsetMinutes, weekdayOf, zonedTimeToInstant } from './time.ts';

test.each([
  ['America/New_York', '2026-01-15T12:00:00Z', -300], ['America/New_York', '2026-07-15T12:00:00Z', -240],
  ['America/Phoenix', '2026-01-15T12:00:00Z', -420], ['America/Phoenix', '2026-07-15T12:00:00Z', -420],
  ['Europe/London', '2026-01-15T12:00:00Z', 0], ['Europe/London', '2026-07-15T12:00:00Z', 60],
  ['Europe/Dublin', '2026-01-15T12:00:00Z', 0], ['Europe/Dublin', '2026-07-15T12:00:00Z', 60],
  ['Asia/Kolkata', '2026-01-15T12:00:00Z', 330], ['Asia/Kathmandu', '2026-07-15T12:00:00Z', 345],
])('offsetMinutes(%s, %s) is %i', (tz, at, minutes) => {
  expect(offsetMinutes(new Date(at), tz)).toBe(minutes);
});

test.each([
  ['2026-10-27', '20:30', 'Asia/Kolkata', '2026-10-27T15:00:00.000Z'],
  ['2026-03-08', '02:00', 'America/New_York', '2026-03-08T07:00:00.000Z'], // gap: 2:00 becomes 3:00 EDT
  ['2026-03-08', '02:30', 'America/New_York', '2026-03-08T07:30:00.000Z'], // gap: 2:30 becomes 3:30 EDT
  ['2026-03-29', '01:30', 'Europe/London', '2026-03-29T01:30:00.000Z'],    // gap: 1:30 becomes 2:30 BST
  ['2026-11-01', '01:30', 'America/New_York', '2026-11-01T05:30:00.000Z'], // repeated hour: first (EDT)
  ['2026-10-25', '01:30', 'Europe/London', '2026-10-25T00:30:00.000Z'],    // repeated hour: first (BST)
])('zonedTimeToInstant(%s %s, %s) is %s', (date, time, tz, expected) => {
  expect(zonedTimeToInstant(date, time, tz).toISOString()).toBe(expected);
});

test('one instant falls on different calendar days', () => {
  const at = new Date('2026-10-27T01:00:00Z'); // Mon 6:00 PM in Los Angeles
  expect(localDate(at, 'America/Los_Angeles')).toBe('2026-10-26');
  expect(localDate(at, 'Asia/Kolkata')).toBe('2026-10-27');
});

test('calendar helpers', () => {
  expect([weekdayOf('2026-10-25'), weekdayOf('2026-10-27')]).toEqual([0, 2]);
  expect([addDays('2026-10-31', 1), addDays('2026-11-01', -1)]).toEqual(['2026-11-01', '2026-10-31']);
});

test.each(['Asia/Kolkata', 'Asia/Calcutta', 'Europe/Dublin', 'UTC', 'US/Eastern'])('accepts %s', (tz) => {
  expect(isValidTimeZone(tz)).toBe(true);
});
test.each(['IST', 'EST', 'GMT', 'Mars/Olympus', '', 'GMT+5:30x'])('rejects %j', (tz) => {
  expect(isValidTimeZone(tz)).toBe(false);
});
```

- [ ] **Step 3: Run the tests and see them fail**

Run: `npx vitest run src/shared/time.test.ts`
Expected: FAIL, failing to resolve `./time.ts`.

- [ ] **Step 4: Implement the conversions in `src/shared/time.ts`**
  - `isValidTimeZone` is true only when `tz === 'UTC'` or `tz.includes('/')`, **and** `new Intl.DateTimeFormat('en-US', { timeZone: tz })` doesn't throw. ICU accepts "IST" and maps it to India, so the slash rule matters (spec §7 rule 8).
  - `offsetMinutes` parses the `timeZoneName: 'longOffset'` part (`GMT+05:30`, or plain `GMT` for zero).
  - `localDate` assembles `year`/`month`/`day` from `formatToParts`.
  - `weekdayOf` and `addDays` use `Date.UTC` arithmetic on the date string.
  - Cache `Intl.DateTimeFormat` instances in a `Map` keyed by locale, zone and options, because slot building calls these hundreds of times per request.
  - Head the file with `// ponytail: Intl only; swap for Temporal.ZonedDateTime once Node and Safari ship it`.
  - `zonedTimeToInstant` must use this algorithm (it gives Temporal's `'compatible'` behaviour):

```ts
const wall = Date.UTC(y, m - 1, d, hh, mm, ss);          // the wall-clock reading as if it were UTC
const early = offsetMinutes(new Date(wall - 86_400_000), tz);
const late = offsetMinutes(new Date(wall + 86_400_000), tz);
const valid = [early, late]
  .map((o) => wall - o * 60_000)
  .filter((t) => offsetMinutes(new Date(t), tz) * 60_000 === wall - t);
// repeated hour: two valid instants, take the earlier; gap: none valid, move forward by the gap
return new Date(valid.length ? Math.min(...valid) : wall - early * 60_000);
```

- [ ] **Step 5: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times, under `TZ=UTC`, `TZ=Pacific/Chatham` and `TZ=America/Los_Angeles`. Chatham is ahead of UTC and Los Angeles behind it, so a local-time getter on a UTC-midnight value fails one of them.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts src/shared/time.ts src/shared/time.test.ts
git commit -m "feat(time): add intl-only zone conversions with dst gap and overlap rules"
```

---

### Task 2: Time display formatting

**Files:**
- Modify: `src/shared/time.ts`, `src/shared/time.test.ts`

**Interfaces:**
- Consumes: `offsetMinutes`, `localDate` (Task 1).
- Produces (`src/shared/time.ts`):
  - `formatOffset(minutes: number): string`: `'GMT'`, `'GMT+1'`, `'GMT+5:30'`, `'GMT-4'`
  - `zoneAbbreviation(at: Date, tz: string): string`
  - `cityName(tz: string): string`
  - `canonicalTimeZone(tz: string): string`
  - `formatTime(at, tz)`: `'4:00 PM'`
  - `formatDate(at, tz)`: `'Tue 27 Oct'`
  - `formatDateWithYear(at, tz)`: `'Tue 27 Oct 2026'`
  - `formatDayKey(key: string): string`: `'Sun 25 Oct'`
  - `formatZone(at, tz)`: `'BST (London)'`
  - `formatWhen(at, tz)`: `'Fri 23 Oct, 4:00 PM BST (London)'`
  - `formatSpan(start: Date, end: Date, tz: string): string`: `'4:00–5:00 PM GMT (London)'`
  - `formatZoneOption(at, tz)`: `'London (GMT+1)'`
  - `formatOtherTime(at, tz, viewerTz)`: the other side's time for a reader in `viewerTz`: `'9:30 PM IST'`, or `'Tue 27 Oct, 2:30 AM IST'` when `at` falls on a different date in `tz` than in `viewerTz`
  - All `at` and `tz` parameters are `Date` and `string`; all return `string`.

- [ ] **Step 1: Write the failing tests** (append to `src/shared/time.test.ts`)

```ts
test.each([
  ['2026-10-27T16:00:00Z', 'Europe/London', 'Tue 27 Oct, 4:00 PM GMT (London)'],
  ['2026-10-23T15:00:00Z', 'Europe/London', 'Fri 23 Oct, 4:00 PM BST (London)'],
  ['2026-10-27T16:00:00Z', 'Asia/Kolkata', 'Tue 27 Oct, 9:30 PM IST (Kolkata)'],
  ['2026-10-27T16:00:00Z', 'Asia/Calcutta', 'Tue 27 Oct, 9:30 PM IST (Kolkata)'],
  ['2026-11-03T15:00:00Z', 'America/New_York', 'Tue 3 Nov, 10:00 AM EST (New York)'],
])('formatWhen(%s, %s)', (at, tz, expected) => expect(formatWhen(new Date(at), tz)).toBe(expected));

test.each([
  ['2026-07-15T12:00:00Z', 'Europe/Dublin', 'IST'], ['2026-01-15T12:00:00Z', 'Europe/Dublin', 'GMT'],
  ['2026-01-15T12:00:00Z', 'America/Phoenix', 'MST'], ['2026-07-15T12:00:00Z', 'America/Phoenix', 'MST'],
  ['2026-07-15T12:00:00Z', 'America/New_York', 'EDT'], ['2026-07-15T12:00:00Z', 'Asia/Tokyo', 'GMT+9'],
])('zoneAbbreviation(%s, %s) is %s', (at, tz, expected) => expect(zoneAbbreviation(new Date(at), tz)).toBe(expected));

test.each([
  ['2026-10-27T16:00:00Z', '2026-10-27T17:00:00Z', 'Europe/London', '4:00–5:00 PM GMT (London)'],
  ['2026-10-27T11:00:00Z', '2026-10-27T12:00:00Z', 'Europe/London', '11:00 AM–12:00 PM GMT (London)'],
  ['2026-10-25T00:00:00Z', '2026-10-25T01:00:00Z', 'Europe/London', '1:00 AM BST–1:00 AM GMT (London)'],
  ['2026-10-27T16:00:00Z', '2026-10-27T17:00:00Z', 'Asia/Kolkata', '9:30–10:30 PM IST (Kolkata)'],
])('formatSpan(%s, %s, %s)', (start, end, tz, expected) => {
  expect(formatSpan(new Date(start), new Date(end), tz)).toBe(expected);
});

test('dates, cities, offsets and picker labels', () => {
  expect(formatDateWithYear(new Date('2026-10-27T16:00:00Z'), 'Europe/London')).toBe('Tue 27 Oct 2026');
  expect(formatDayKey('2026-10-25')).toBe('Sun 25 Oct');
  expect(['America/New_York', 'America/Indiana/Indianapolis', 'Asia/Calcutta', 'Europe/Kiev', 'UTC'].map(cityName))
    .toEqual(['New York', 'Indianapolis', 'Kolkata', 'Kyiv', 'UTC']);
  expect([0, 60, 330, -240, 345].map(formatOffset)).toEqual(['GMT', 'GMT+1', 'GMT+5:30', 'GMT-4', 'GMT+5:45']);
  expect(formatZoneOption(new Date('2026-07-15T12:00:00Z'), 'Europe/London')).toBe('London (GMT+1)');
  expect(formatZoneOption(new Date('2026-01-15T12:00:00Z'), 'Europe/London')).toBe('London (GMT)');
  expect(formatZoneOption(new Date('2026-07-15T12:00:00Z'), 'Asia/Kolkata')).toBe('Kolkata (GMT+5:30)');
  expect(canonicalTimeZone('Asia/Kolkata')).toBe(canonicalTimeZone('Asia/Calcutta'));
  expect(formatTime(new Date('2026-10-27T16:00:00Z'), 'Europe/London')).not.toMatch(/\u202f/);
});

test("the other side's time carries its date when the two sides are on different days", () => {
  const usEvening = new Date('2026-10-26T21:00:00Z'); // Mon 5:00 PM in New York = Tue 2:30 AM in Kolkata
  expect(formatOtherTime(new Date('2026-10-27T16:00:00Z'), 'Asia/Kolkata', 'Europe/London')).toBe('9:30 PM IST');
  expect(formatOtherTime(usEvening, 'Asia/Kolkata', 'America/New_York')).toBe('Tue 27 Oct, 2:30 AM IST');
  expect(formatOtherTime(usEvening, 'America/New_York', 'Asia/Kolkata')).toBe('Mon 26 Oct, 5:00 PM EDT');
});
```

- [ ] **Step 2: Run the tests and see the new ones fail**

Run: `npx vitest run src/shared/time.test.ts`
Expected: FAIL. The new tests throw `TypeError: formatWhen is not a function` (and the like); the Task 1 tests still pass.

- [ ] **Step 3: Implement the formatters in `src/shared/time.ts`**
  - **`formatTime`**: `en-US` with `{ hour: 'numeric', minute: '2-digit' }`, then replace U+202F with a plain space.
  - **`formatDate`**: `en-GB` with `{ weekday: 'short', day: 'numeric', month: 'short' }`.
  - **`formatDateWithYear`**: `formatDate` plus a space plus the `year` part. Don't ask `en-GB` for the year, because that inserts a comma after the weekday.
  - **`formatDayKey(key)`**: `formatDate(new Date(key + 'T12:00:00Z'), 'UTC')`.
  - **`zoneAbbreviation`**: take the first of `['en-US', 'en-GB', 'en-IE', 'en-IN', 'en-CA', 'en-AU']` whose `timeZoneName: 'short'` part doesn't match `/^(GMT|UTC)[+-]/`. If none qualifies, return `formatOffset(offsetMinutes(at, tz))`. Mark it with `// ponytail: six English locales cover the zones we serve; add a per-zone map if one picks a wrong name`.
  - **`cityName`**:
    - alias map `{ 'Asia/Calcutta': 'Kolkata', 'Europe/Kiev': 'Kyiv', 'Asia/Saigon': 'Ho Chi Minh City' }`;
    - otherwise the last `/` segment with `_` turned into spaces.
  - **`canonicalTimeZone`**: `new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone`.
  - **`formatSpan`**:
    - If start and end have different offsets: `${time} ${abbr}–${time} ${abbr} (${city})`.
    - Otherwise, if both share AM/PM: `'4:00–5:00 PM GMT (London)'`.
    - Otherwise: `'11:00 AM–12:00 PM GMT (London)'`.
    - The separator is an en dash (U+2013).
  - **`formatZoneOption`**: `${cityName} (${formatOffset(offsetMinutes)})`.
  - **`formatOtherTime`**: `${formatTime} ${zoneAbbreviation}`, prefixed by `${formatDate}, ` when `localDate(at, tz) !== localDate(at, viewerTz)`.

- [ ] **Step 4: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times.

- [ ] **Step 5: Commit**

```bash
git add src/shared/time.ts src/shared/time.test.ts
git commit -m "feat(time): format times with locally used zone names and city"
```

---

### Task 3: Database: schema, migrations, test databases

**Files:**
- Create: `docker-compose.yml`, `migrations/001_init.sql`, `src/server/db.ts`, `src/server/test-db.ts`, `src/server/db.test.ts`
- Modify: `package.json` (dependency `pg`; dev dependency `@types/pg`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/server/db.ts`:
    - `createPool(connectionString: string, max?: number): pg.Pool`. Attaches `pool.on('error', …)` logging that skips `err.code === '57P01'` (a test teardown's `drop database … with (force)` ends idle connections), and its module sets the `date` parser.
    - `migrate(pool: pg.Pool): Promise<string[]>`, which returns the file names it applied.
  - `src/server/test-db.ts`:
    - `type TestDb = { pool: pg.Pool; drop(): Promise<void> }`
    - `createTestDb(): Promise<TestDb>`
    - `insertMentor(pool: pg.Pool, m: { name?: string; timeZone: string; hours: { weekday: number; start: string; end: string }[] }): Promise<number>`

- [ ] **Step 1: Write `docker-compose.yml`** with two services for now:
  - `db`:
    - `postgres:17-alpine`, with `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` all `bookings`, plus `TZ: UTC`;
    - ports `"5433:5432"`;
    - `command: ["postgres", "-c", "max_connections=200"]`, because test files run in parallel and each race test opens up to 40 connections;
    - healthcheck `pg_isready -U bookings -d bookings` (interval 2s, retries 30);
    - named volume `db-data` mounted at `/var/lib/postgresql/data`.
  - `mailpit`: `axllent/mailpit:v1.31.6` (its image has a `readyz` healthcheck, so `--wait` waits on it), `TZ: UTC`, ports `"8025:8025"` and `"1025:1025"`.

  Start them: `docker compose up -d db mailpit`.

- [ ] **Step 2: Write `migrations/001_init.sql`**, copying spec §11 verbatim: the three tables, the partial unique index `bookings_one_per_mentor_hour`, and the index `bookings_mentor_day`.

- [ ] **Step 3: Write the failing tests** in `src/server/db.test.ts`

```ts
import { afterAll, beforeAll, expect, test } from 'vitest';
import { migrate } from './db.ts';
import { createTestDb, insertMentor, type TestDb } from './test-db.ts';

let db: TestDb;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.drop());

const insertBooking = (mentorId: number, startsAt: string, localDay: string) => db.pool.query(
  `insert into bookings (mentor_id, starts_at, mentor_local_date, parent_name, parent_email, child_name, parent_time_zone, class_link)
   values ($1, $2, $3, 'Asha Patel', 'asha@example.com', 'Rohan', 'Europe/London', 'https://classroom.example/trial/x')
   returning id, mentor_local_date`, [mentorId, startsAt, localDay]);

test('migrate is idempotent and creates the tables', async () => {
  expect(await migrate(db.pool)).toEqual([]);
  const { rows } = await db.pool.query(`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
  expect(rows.map((r) => r.table_name)).toEqual(['bookings', 'mentor_hours', 'mentors', 'schema_migrations']);
});

test('date columns come back as plain strings in any host time zone', async () => {
  const mentorId = await insertMentor(db.pool, { timeZone: 'Asia/Kolkata', hours: [] });
  const { rows } = await insertBooking(mentorId, '2026-10-27T15:00:00Z', '2026-10-27');
  expect(rows[0].mentor_local_date).toBe('2026-10-27');
});

test('a mentor can have only one active booking per hour', async () => {
  const mentorId = await insertMentor(db.pool, { timeZone: 'Asia/Kolkata', hours: [] });
  const first = await insertBooking(mentorId, '2026-10-28T15:00:00Z', '2026-10-28');
  await expect(insertBooking(mentorId, '2026-10-28T15:00:00Z', '2026-10-28')).rejects.toMatchObject({ code: '23505' });
  await db.pool.query('update bookings set cancelled_at = now() where id = $1', [first.rows[0].id]);
  await expect(insertBooking(mentorId, '2026-10-28T15:00:00Z', '2026-10-28')).resolves.toBeTruthy();
});
```

- [ ] **Step 4: Run them and see them fail**

Run: `npx vitest run src/server/db.test.ts`
Expected: FAIL, failing to resolve `./db.ts`.

- [ ] **Step 5: Implement `src/server/db.ts` and `src/server/test-db.ts`**
  - **The `date` parser**: at module load in `db.ts`, call `pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v)`. By default, `pg` turns a `date` into local midnight, and under `TZ=Pacific/Chatham` that shifts it a day.
  - **`migrate`**, on one client:
    1. Take `pg_advisory_lock(727001)`.
    2. `create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`.
    3. Read `migrations/*.sql` sorted, resolved with `new URL('../../migrations/', import.meta.url)`.
    4. Run each unapplied file plus its `insert` into `schema_migrations` in its own transaction.
    5. Unlock in `finally`.
  - **`createTestDb`**:
    - Connect an admin pool to `process.env.DATABASE_URL ?? 'postgres://bookings:bookings@localhost:5433/bookings'`.
    - `create database "t_<12 random hex>"`.
    - `createPool(urlForThatDb, 40)` (40 connections for the race tests), then `migrate`.
    - `drop()` ends the pool, runs `drop database … with (force)`, then ends the admin pool.
  - **`insertMentor`** inserts:
    - the name (default `'Test Mentor'`);
    - a unique email `m-<random>@mentors.example`;
    - bio `'Test mentor'`, subjects `{Coding}`;
    - the hours rows.
    It returns the id.

- [ ] **Step 6: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times. Under `TZ=Pacific/Chatham`, the date test proves the parser works.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml migrations/001_init.sql src/server/db.ts src/server/test-db.ts src/server/db.test.ts package.json package-lock.json
git commit -m "feat(db): add schema, migration runner and per-file test databases"
```

---

### Task 4: Slot rules (pure)

**Files:**
- Create: `src/server/slots.ts`, `src/server/slots.test.ts`

**Interfaces:**
- Consumes: `zonedTimeToInstant`, `localDate`, `weekdayOf`, `addDays` (Task 1).
- Produces (`src/server/slots.ts`):

```ts
export const CLASS_MINUTES = 60, LEAD_MINUTES = 120, HORIZON_DAYS = 14, DAILY_CAP = 2;
export type WorkingHours = { weekday: number; start: string; end: string };   // 'HH:MM', in the mentor's own time zone
export type Mentor = { id: number; name: string; email: string; bio: string; subjects: string[]; timeZone: string; hours: WorkingHours[] };
export type ActiveBooking = { mentorId: number; startsAt: Date; mentorLocalDate: string };
export type Slot = { startsAt: Date; available: boolean };
export function isBookableTime(startsAt: Date, now: Date): boolean;            // on the UTC hour, within [now+120min, now+14d]
export function worksAt(mentor: Mentor, startsAt: Date): boolean;              // the whole class fits one working-hours window
export function classStarts(mentor: Mentor, from: Date, to: Date): Date[];     // sorted, unique, inside [from, to]
export function buildSlots(mentors: Mentor[], bookings: ActiveBooking[], now: Date): Slot[];  // sorted by startsAt
```

- [ ] **Step 1: Write the failing tests** in `src/server/slots.test.ts`

```ts
import { expect, test } from 'vitest';
import { localDate } from '../shared/time.ts';
import { buildSlots, classStarts, isBookableTime, worksAt, type ActiveBooking, type Mentor, type Slot, type WorkingHours } from './slots.ts';

const NOW = new Date('2026-10-20T12:00:00Z');
const hours = (weekdays: number[], start: string, end: string): WorkingHours[] => weekdays.map((weekday) => ({ weekday, start, end }));
const mentor = (id: number, timeZone: string, h: WorkingHours[]): Mentor =>
  ({ id, name: `M${id}`, email: `m${id}@mentors.example`, bio: '', subjects: [], timeZone, hours: h });
const ukEvening = (id: number) => mentor(id, 'Asia/Kolkata', hours([1, 2, 3, 4, 5], '20:30', '23:30'));
const isoList = (dates: Date[]) => dates.map((d) => d.toISOString());
const slotAt = (slots: Slot[], iso: string) => slots.find((s) => s.startsAt.toISOString() === iso);
const booking = (mentorId: number, iso: string, day: string): ActiveBooking => ({ mentorId, startsAt: new Date(iso), mentorLocalDate: day });

test('weekly hours become class starts on the UTC hour', () => {
  expect(isoList(classStarts(ukEvening(1), new Date('2026-10-27T00:00:00Z'), new Date('2026-10-28T00:00:00Z'))))
    .toEqual(['2026-10-27T15:00:00.000Z', '2026-10-27T16:00:00.000Z', '2026-10-27T17:00:00.000Z']);
});

test('the window runs from 2 hours to 14 days ahead, both inclusive', () => {
  const slots = buildSlots([mentor(1, 'UTC', hours([0, 1, 2, 3, 4, 5, 6], '00:00', '23:59'))], [], NOW);
  expect(slots[0]!.startsAt.toISOString()).toBe('2026-10-20T14:00:00.000Z');
  expect(slots.at(-1)!.startsAt.toISOString()).toBe('2026-11-03T12:00:00.000Z');
  expect(isBookableTime(new Date('2026-10-20T14:00:00Z'), NOW)).toBe(true);
  expect(isBookableTime(new Date('2026-10-20T13:00:00Z'), NOW)).toBe(false); // too soon
  expect(isBookableTime(new Date('2026-10-20T14:30:00Z'), NOW)).toBe(false); // not on the hour
  expect(isBookableTime(new Date('2026-11-03T13:00:00Z'), NOW)).toBe(false); // beyond 14 days
});

test('an hour is full only when every mentor working it is taken', () => {
  const two = [ukEvening(1), ukEvening(2)];
  const at16 = (b: ActiveBooking[]) => slotAt(buildSlots(two, b, NOW), '2026-10-27T16:00:00.000Z')?.available;
  expect(at16([booking(1, '2026-10-27T16:00:00Z', '2026-10-27')])).toBe(true);
  expect(at16([booking(1, '2026-10-27T16:00:00Z', '2026-10-27'), booking(2, '2026-10-27T16:00:00Z', '2026-10-27')])).toBe(false);
});

test("the cap closes only the rest of the mentor's own day", () => {
  const slots = buildSlots([ukEvening(1)], [booking(1, '2026-10-27T15:00:00Z', '2026-10-27'), booking(1, '2026-10-27T16:00:00Z', '2026-10-27')], NOW);
  expect(slotAt(slots, '2026-10-27T17:00:00.000Z')?.available).toBe(false);
  expect(slotAt(slots, '2026-10-28T15:00:00.000Z')?.available).toBe(true);
});

test("a Los Angeles parent's Monday evening counts toward the mentor's Tuesday", () => {
  const laMonday = '2026-10-27T01:00:00Z'; // Mon 26 Oct, 6:00 PM PDT = Tue 27 Oct, 6:30 AM in Kolkata
  expect(localDate(new Date(laMonday), 'America/Los_Angeles')).toBe('2026-10-26');
  const m = mentor(1, 'Asia/Kolkata', [...hours([2], '06:30', '07:30'), ...hours([1, 2], '20:30', '22:30')]);
  const slots = buildSlots([m], [booking(1, laMonday, '2026-10-27'), booking(1, '2026-10-27T15:00:00Z', '2026-10-27')], NOW);
  expect(slotAt(slots, '2026-10-27T16:00:00.000Z')?.available).toBe(false); // Tuesday is at the cap
  expect(slotAt(slots, '2026-10-26T15:00:00.000Z')?.available).toBe(true);  // Monday is untouched
});

test("the cap uses the mentor's own day, not the UTC day", () => {
  // Tue 02:30-07:30 in Kolkata runs from Mon 26 Oct 21:00Z to Tue 27 Oct 02:00Z
  const m = mentor(1, 'Asia/Kolkata', hours([2], '02:30', '07:30'));
  const slots = buildSlots([m], [booking(1, '2026-10-26T21:00:00Z', '2026-10-27'), booking(1, '2026-10-26T22:00:00Z', '2026-10-27')], NOW);
  for (const iso of ['2026-10-26T23:00:00.000Z', '2026-10-27T00:00:00.000Z', '2026-10-27T01:00:00.000Z'])
    expect(slotAt(slots, iso)?.available).toBe(false); // the mentor's Tuesday is full on either UTC date
  expect(slotAt(slots, '2026-11-02T21:00:00.000Z')?.available).toBe(true); // next Tuesday is open
});

test('a mentor in New York on the spring-forward day', () => {
  const ny = (start: string, end: string) => mentor(1, 'America/New_York', hours([0], start, end));
  const day = [new Date('2026-03-08T00:00:00Z'), new Date('2026-03-09T00:00:00Z')] as const;
  expect(isoList(classStarts(ny('02:00', '05:00'), ...day))).toEqual(['2026-03-08T07:00:00.000Z', '2026-03-08T08:00:00.000Z']);
  expect(isoList(classStarts(ny('02:30', '05:30'), ...day))).toEqual(['2026-03-08T08:00:00.000Z']); // window starts 3:30 EDT; first class 4:00 EDT
});

test('a mentor in New York on the fall-back day', () => {
  const m = mentor(1, 'America/New_York', hours([0], '01:00', '03:00'));
  expect(isoList(classStarts(m, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-02T00:00:00Z'))))
    .toEqual(['2026-11-01T05:00:00.000Z', '2026-11-01T06:00:00.000Z', '2026-11-01T07:00:00.000Z']);
});

test("US-evening hours put both of London's 1:00 AM slots on 25 Oct", () => {
  const starts = buildSlots([mentor(6, 'Asia/Kolkata', hours([0, 2, 3, 4, 5, 6], '02:30', '07:30'))], [], NOW).map((s) => s.startsAt.toISOString());
  expect(starts).toEqual(expect.arrayContaining(['2026-10-25T00:00:00.000Z', '2026-10-25T01:00:00.000Z']));
});

test("worksAt fits the whole class inside the mentor's hours", () => {
  expect(worksAt(ukEvening(1), new Date('2026-10-27T17:00:00Z'))).toBe(true);  // 10:30-11:30 PM in Kolkata
  expect(worksAt(ukEvening(1), new Date('2026-10-27T18:00:00Z'))).toBe(false); // would end after 11:30 PM
  expect(worksAt(ukEvening(1), new Date('2026-10-25T15:00:00Z'))).toBe(false); // Sunday
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/server/slots.test.ts`
Expected: FAIL, failing to resolve `./slots.ts`.

- [ ] **Step 3: Implement `src/server/slots.ts`**
  - **`classStarts`**: loop over the mentor's local dates from `addDays(localDate(from, tz), -1)` to `addDays(localDate(to, tz), 1)`. For each hours row whose `weekday === weekdayOf(date)`:
    - the window is `[zonedTimeToInstant(date, start, tz), zonedTimeToInstant(date, end, tz)]`;
    - the first start is the window start rounded up to the UTC hour;
    - step one hour at a time while `start + 60 min ≤ windowEnd`;
    - keep starts inside `[from, to]`.
  - **`worksAt`**: the same window test, on `localDate(startsAt, tz)` only.
  - **`buildSlots`**:
    - Take `classStarts` over `[now + 120 min, now + 14 days]` for every mentor.
    - A (mentor, start) pair is open when there's no booking for that mentor at that instant, and the mentor's count for `localDate(start, mentor.timeZone)` is under `DAILY_CAP`.
    - Merge by instant: `available` is true if any pair is open.

- [ ] **Step 4: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times.

- [ ] **Step 5: Commit**

```bash
git add src/server/slots.ts src/server/slots.test.ts
git commit -m "feat(slots): turn weekly hours into utc class starts with cap and dst rules"
```

---

### Task 5: Booking transaction and data access

**Files:**
- Create: `src/server/bookings.ts`, `src/server/bookings.test.ts`
- Modify: `src/server/test-db.ts` (add `expectBookingRulesHold`)

**Interfaces:**
- Consumes:
  - `Mentor`, `ActiveBooking`, `isBookableTime`, `worksAt`, `DAILY_CAP`, `buildSlots` (Task 4);
  - `localDate` (Task 1);
  - `createTestDb`, `insertMentor` (Task 3).
- Produces (`src/server/bookings.ts`):

```ts
export type BookingInput = { startsAt: Date; parentName: string; parentEmail: string; childName: string; parentTimeZone: string };
export type Booking = BookingInput & { id: string; mentorId: number; mentorLocalDate: string; classLink: string; cancelledAt: Date | null };
export type BookResult = { ok: true; booking: Booking } | { ok: false; code: 'SLOT_UNAVAILABLE' };
export function newClassLink(): string;                                              // https://classroom.example/trial/<random>
export async function loadMentors(pool: Pool): Promise<Mentor[]>;                   // with hours ('HH:MM'), ordered by id
export async function loadActiveBookings(pool: Pool, from: Date, to: Date): Promise<ActiveBooking[]>;  // from <= starts_at < to
export async function bookSlot(pool: Pool, input: BookingInput, now: Date, hooks?: { beforeInsert?: () => Promise<void> }): Promise<BookResult>;
export async function getBookingWithMentor(pool: Pool, id: string): Promise<{ booking: Booking; mentor: Mentor } | null>;
// src/server/test-db.ts (test-only)
export async function expectBookingRulesHold(pool: Pool): Promise<void>;
```

- [ ] **Step 1: Write the failing tests** in `src/server/bookings.test.ts`
  - Each test gets a fresh database: `beforeEach` runs `createTestDb`, and `afterEach` runs `drop`.
  - Shared helpers:
    - `NOW = new Date('2026-10-20T12:00:00Z')`.
    - `ukHours`: weekdays 1–5, `'20:30'–'23:30'`.
    - `usHours`: weekdays 0, 2, 3, 4, 5, 6, `'02:30'–'07:30'`.
    - `input(iso)`: a London parent, Asha Patel / Rohan.
    - `sleep(ms)`.
    - `seededPick(seed)`: a 3-line linear congruential generator returning `(list) => list[index]`.

```ts
test('assigns the least-booked mentor, then the lowest id', async () => {
  const a = await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours });
  const b = await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours });
  const first = await bookSlot(pool, input('2026-10-27T15:00:00Z'), NOW);
  const second = await bookSlot(pool, input('2026-10-27T16:00:00Z'), NOW);
  expect([first, second].map((r) => r.ok && r.booking.mentorId)).toEqual([a, b]);
});

test("stores the instant and the date in the mentor's own time zone", async () => {
  await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: [{ weekday: 2, start: '02:30', end: '03:30' }] });
  const result = await bookSlot(pool, input('2026-10-26T21:00:00Z'), NOW); // Mon 9:00 PM in London = Tue 2:30 AM in Kolkata
  expect(result).toMatchObject({ ok: true, booking: { mentorLocalDate: '2026-10-27' } });
  expect(result.ok && result.booking.classLink).toMatch(/^https:\/\/classroom\.example\/trial\/[\w-]{8,}$/);
  const { rows } = await pool.query('select starts_at, mentor_local_date from bookings');
  expect([rows[0].starts_at.toISOString(), rows[0].mentor_local_date]).toEqual(['2026-10-26T21:00:00.000Z', '2026-10-27']);
});

test('cancelled bookings free both the hour and the cap', async () => {
  await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours });
  const first = await bookSlot(pool, input('2026-10-27T15:00:00Z'), NOW);
  await bookSlot(pool, input('2026-10-27T16:00:00Z'), NOW);
  expect(await bookSlot(pool, input('2026-10-27T17:00:00Z'), NOW)).toEqual({ ok: false, code: 'SLOT_UNAVAILABLE' });
  await pool.query('update bookings set cancelled_at = now() where id = $1', [first.ok && first.booking.id]);
  expect((await bookSlot(pool, input('2026-10-27T15:00:00Z'), NOW)).ok).toBe(true);
  expect(await loadActiveBookings(pool, NOW, new Date('2026-11-04T00:00:00Z'))).toHaveLength(2);
});

test('refuses times that cannot be booked', async () => {
  await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours });
  // off the hour, too soon, beyond 14 days, nobody works on Sunday
  for (const t of ['2026-10-27T15:30:00Z', '2026-10-20T13:00:00Z', '2026-11-04T15:00:00Z', '2026-10-25T15:00:00Z'])
    expect(await bookSlot(pool, input(t), NOW)).toEqual({ ok: false, code: 'SLOT_UNAVAILABLE' });
});

test('same-hour race: exactly one booking per free mentor', async () => {
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push(await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours }));
  const results = await Promise.all(Array.from({ length: 10 }, () => bookSlot(pool, input('2026-10-27T16:00:00Z'), NOW)));
  const booked = results.flatMap((r) => (r.ok ? [r.booking.mentorId] : []));
  expect(booked).toHaveLength(3);
  expect(new Set(booked)).toEqual(new Set(ids));
  expect(results.filter((r) => !r.ok)).toHaveLength(7);
});

test('cap race: the lock makes the second booking wait, then refuse', async () => {
  await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours });
  await bookSlot(pool, input('2026-10-27T15:00:00Z'), NOW);
  const pause = { beforeInsert: () => sleep(100) };
  const results = await Promise.all([
    bookSlot(pool, input('2026-10-27T16:00:00Z'), NOW, pause),
    bookSlot(pool, input('2026-10-27T17:00:00Z'), NOW, pause),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  const { rows } = await pool.query(`select count(*)::int as n from bookings where mentor_local_date = '2026-10-27' and cancelled_at is null`);
  expect(rows[0].n).toBe(2);
});

test('a random burst keeps every rule', async () => {
  for (let i = 0; i < 5; i++) await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours });
  for (let i = 0; i < 5; i++) await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: usHours });
  const mentors = await loadMentors(pool);
  const open = buildSlots(mentors, [], NOW).map((s) => s.startsAt.toISOString());
  const pick = seededPick(42);
  const results = await Promise.all(Array.from({ length: 80 }, () => bookSlot(pool, input(pick(open)), NOW)));
  expect(results.some((r) => r.ok)).toBe(true);
  await expectBookingRulesHold(pool);
});
```

  Add `expectBookingRulesHold(pool: Pool): Promise<void>` to `src/server/test-db.ts`. Task 8 reuses it. It asserts three things:
  - no active duplicate `(mentor_id, starts_at)`: `group by … having count(*) > 1` returns no rows;
  - no `(mentor_id, mentor_local_date)` with more than 2 active bookings;
  - every booking passes `worksAt(mentor, starts_at)`, and its `mentor_local_date` equals `localDate(starts_at, mentor.timeZone)`. Mentors come from `loadMentors`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/server/bookings.test.ts`
Expected: FAIL, failing to resolve `./bookings.ts`.

- [ ] **Step 3: Implement `src/server/bookings.ts`**
  - **`bookSlot`** follows spec §6 exactly:
    1. If `!isBookableTime(startsAt, now)`, return `SLOT_UNAVAILABLE`.
    2. Candidates are `loadMentors` filtered by `worksAt`. Sort them by active count on `localDate(startsAt, mentor.timeZone)`, then by id. Get the counts with one `group by mentor_id, mentor_local_date` query.
    3. For each candidate, check out one client and run `BEGIN` (default READ COMMITTED):
       1. `SELECT id FROM mentors WHERE id = $1 FOR UPDATE`.
       2. Look for an active booking at `(mentor_id, starts_at)`. If one exists, `ROLLBACK` and try the next candidate.
       3. Count active bookings on `(mentor_id, mentor_local_date)`. If the count is at least `DAILY_CAP`, `ROLLBACK` and try the next candidate.
       4. `await hooks?.beforeInsert?.()`.
       5. `INSERT … RETURNING *`, then `COMMIT`.
       6. On error code `23505`, `ROLLBACK` and try the next candidate. Re-throw any other error after `ROLLBACK`.
       7. Release the client in `finally`.
    4. If no candidate succeeded, return `SLOT_UNAVAILABLE`.
  - It never sends email. Comment the `FOR UPDATE` line: `// the turnstile: bookings for one mentor take turns (spec §6); relies on read committed`.
  - **Mapping and loading:**
    - `loadMentors` trims `time` values to `'HH:MM'`.
    - Rows map to camelCase.
    - `newClassLink` is `https://classroom.example/trial/${randomUUID()}`.

- [ ] **Step 4: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times.

- [ ] **Step 5: Prove the cap race test can fail.**
  1. Temporarily delete the `FOR UPDATE` statement and run `npx vitest run src/server/bookings.test.ts -t "cap race"`.
     Expected: FAIL, `AssertionError: expected [ …(2) ] to have a length of 1 but got 2`.
  2. Save that failing output in `docs/red-run.txt`. The README quotes it in Task 14.
  3. Restore the line and re-run.
     Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/bookings.ts src/server/bookings.test.ts src/server/test-db.ts docs/red-run.txt
git commit -m "feat(bookings): book with a per-mentor row lock and prove the race test bites"
```

---

### Task 6: Emails

**Files:**
- Create: `src/server/email.ts`, `src/server/email.test.ts`
- Modify: `package.json` (dependency `nodemailer`; dev dependency `@types/nodemailer`)

**Interfaces:**
- Consumes: `formatWhen`, `formatDate`, `formatSpan`, `formatOtherTime`, `cityName` (Task 2).
- Produces (`src/server/email.ts`):

```ts
export type EmailMessage = { to: string; subject: string; text: string };
export type Mailer = { send(message: EmailMessage): Promise<void> };
export type EmailBooking = { id: string; startsAt: Date; parentName: string; parentEmail: string; childName: string; parentTimeZone: string;
  classLink: string; mentor: { name: string; email: string; timeZone: string } };
export function renderEmails(b: EmailBooking, appUrl: string): { parent: EmailMessage; mentor: EmailMessage };
export function createSmtpMailer(smtpUrl: string): Mailer;   // from 'Codeyoung Trials <trials@codeyoung.example>'
```

- [ ] **Step 1: Write the failing tests** in `src/server/email.test.ts`

```ts
const b: EmailBooking = { id: 'b1', startsAt: new Date('2026-10-27T16:00:00Z'), parentName: 'Asha Patel', parentEmail: 'asha@example.com',
  childName: 'Rohan', parentTimeZone: 'Europe/London', classLink: 'https://classroom.example/trial/abc',
  mentor: { name: 'Priya Sharma', email: 'priya.sharma@mentors.example', timeZone: 'Asia/Kolkata' } };

test("the parent's email leads with the parent's time", () => {
  const { parent } = renderEmails(b, 'http://localhost:3000');
  expect(parent.to).toBe('asha@example.com');
  expect(parent.subject).toBe("Rohan's free trial class: Tue 27 Oct, 4:00 PM GMT (London)");
  expect(parent.text).toContain('When: Tue 27 Oct, 4:00–5:00 PM GMT (London)');
  expect(parent.text).toContain("Mentor: Priya Sharma, joining from Kolkata, where it's 9:30 PM IST");
  expect(parent.text).toContain('Class link: https://classroom.example/trial/abc');
  expect(parent.text).toContain('See your booking: http://localhost:3000/bookings/b1');
});

test("the mentor's email leads with the mentor's own time", () => {
  const { mentor } = renderEmails(b, 'http://localhost:3000');
  expect(mentor.to).toBe('priya.sharma@mentors.example');
  expect(mentor.subject).toBe('New trial class: Tue 27 Oct, 9:30 PM IST (Kolkata)');
  expect(mentor.text).toContain('When: Tue 27 Oct, 9:30–10:30 PM IST (Kolkata)');
  expect(mentor.text).toContain('For the family: 4:00 PM GMT in London');
  expect(mentor.text).toContain('Child: Rohan');
  expect(mentor.text).toContain('Parent: Asha Patel');
});

test('abbreviations follow each side across the clock changes', () => {
  expect(renderEmails({ ...b, startsAt: new Date('2026-10-23T15:00:00Z') }, '').parent.subject)
    .toBe("Rohan's free trial class: Fri 23 Oct, 4:00 PM BST (London)");
  expect(renderEmails({ ...b, parentTimeZone: 'America/New_York', startsAt: new Date('2026-11-03T15:00:00Z') }, '').parent.subject)
    .toBe("Rohan's free trial class: Tue 3 Nov, 10:00 AM EST (New York)");
  expect(renderEmails({ ...b, startsAt: new Date('2026-10-23T15:00:00Z') }, '').mentor.text).toContain('For the family: 4:00 PM BST in London');
});

test("each side sees the other side's date when the days differ", () => {
  const { parent, mentor } = renderEmails({ ...b, parentTimeZone: 'America/New_York', startsAt: new Date('2026-10-26T21:00:00Z') }, '');
  expect(parent.text).toContain("Mentor: Priya Sharma, joining from Kolkata, where it's Tue 27 Oct, 2:30 AM IST");
  expect(mentor.text).toContain('For the family: Mon 26 Oct, 5:00 PM EDT in New York');
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/server/email.test.ts`
Expected: FAIL, failing to resolve `./email.ts`.

- [ ] **Step 3: Implement `src/server/email.ts`**
  - The class ends 60 minutes after `startsAt`. `{first}` is the first word of the name. Body copy (exact):
    - **Parent email**:
      - "Hi {first},"
      - blank line
      - "{child}'s free trial class is booked."
      - blank line
      - "When: {formatDate}, {formatSpan}"
      - "Mentor: {mentor.name}, joining from {mentor city}, where it's {formatOtherTime(start, mentor zone, parent zone)}"
      - "Class link: {link}"
      - blank line
      - "See your booking: {appUrl}/bookings/{id}"
    - **Mentor email**:
      - "Hi {first},"
      - blank line
      - "You have a new trial class."
      - blank line
      - "When: {formatDate}, {formatSpan}" (in the mentor's zone)
      - "For the family: {formatOtherTime(start, parent zone, mentor zone)} in {parent city}"
      - "Child: {child}"
      - "Parent: {parentName}"
      - "Class link: {link}"
  - `createSmtpMailer` uses `nodemailer.createTransport(smtpUrl)` and `sendMail({ from, to, subject, text })`.

- [ ] **Step 4: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times.

- [ ] **Step 5: Commit**

```bash
git add src/server/email.ts src/server/email.test.ts package.json package-lock.json
git commit -m "feat(email): render parent and mentor emails in each side's own zone"
```

---

### Task 7: HTTP API, validation and the clock

**Files:**
- Create: `src/shared/types.ts`, `src/server/app.ts`, `src/server/api.test.ts`
- Modify: `package.json` (dependencies `express@5`, `zod@4`; dev dependencies `@types/express`, `supertest`, `@types/supertest`)

**Interfaces:**
- Consumes:
  - `loadMentors`, `loadActiveBookings`, `bookSlot`, `getBookingWithMentor` (Task 5);
  - `buildSlots` (Task 4);
  - `renderEmails`, `Mailer`, and `createSmtpMailer` for the dead-port test (Task 6);
  - `isValidTimeZone` (Task 1).
- Produces:
  - `src/shared/types.ts`:

```ts
export type ErrorCode = 'VALIDATION_FAILED' | 'SLOT_UNAVAILABLE' | 'NOT_FOUND' | 'INTERNAL';
export type ApiErrorBody = { error: { code: ErrorCode; message: string; fields?: Record<string, string> } };
export type SlotDto = { startsAt: string; available: boolean };
export type SlotsResponse = { now: string; demo: boolean; slots: SlotDto[] };
export type MentorDto = { id: number; name: string; bio: string; subjects: string[]; timeZone: string; bookings: { startsAt: string }[] };
export type MentorsResponse = { now: string; demo: boolean; mentors: MentorDto[] };
export type BookingRequest = { startsAt: string; parentName: string; parentEmail: string; childName: string; parentTimeZone: string };
export type BookingDto = { id: string; startsAt: string; endsAt: string; childName: string; parentName: string; parentEmail: string;
  parentTimeZone: string; classLink: string; mentor: { name: string; bio: string; subjects: string[]; timeZone: string } };
export type BookingResponse = { booking: BookingDto };
```

  - `src/server/app.ts`:

```ts
export type Clock = { now: () => Date; demo: boolean };
export function createClock(demoNow: string | undefined, realNow?: () => number): Clock;  // realNow defaults to Date.now
export function createApp(deps: { pool: Pool; clock: Clock; mailer: Mailer; appUrl: string; webDir?: string;
  log?: (message: string, error?: unknown) => void }): Express;                            // log defaults to console.error
```

- [ ] **Step 1: Write the failing tests** in `src/server/api.test.ts`
  - One database for the file. Two mentors in `Asia/Kolkata` with `ukHours` (weekdays 1–5, `'20:30'`–`'23:30'`).
  - A fake mailer pushes into `sent: EmailMessage[]`.
  - `NOW = new Date('2026-10-20T12:00:00Z')`, `clock = { now: () => NOW, demo: false }`.
  - `valid` is a London booking request for `'2026-10-27T16:00:00Z'`.
  - Tests run in file order, and each uses its own date.

```ts
test('books a class, then emails both sides', async () => {
  const res = await request(app).post('/api/bookings').send(valid);
  expect(res.status).toBe(201);
  expect(res.body.booking).toMatchObject({ startsAt: '2026-10-27T16:00:00.000Z', endsAt: '2026-10-27T17:00:00.000Z',
    childName: 'Rohan', parentTimeZone: 'Europe/London', mentor: { timeZone: 'Asia/Kolkata' } });
  await vi.waitFor(() => expect(sent.map((m) => m.to)).toContain('asha@example.com'));
  expect(sent).toHaveLength(2);
});

test('accepts another offset for the same instant', async () => {
  const res = await request(app).post('/api/bookings').send({ ...valid, startsAt: '2026-10-27T18:00:00+01:00' });
  expect([res.status, res.body.booking.startsAt]).toEqual([201, '2026-10-27T17:00:00.000Z']);
});

test('rejects bad input with field errors', async () => {
  const res = await request(app).post('/api/bookings')
    .send({ ...valid, parentName: '   ', childName: 'Ro\nhan', parentEmail: 'nope', parentTimeZone: 'IST', startsAt: '2026-10-27T16:30:00Z' });
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_FAILED');
  expect(Object.keys(res.body.error.fields).sort()).toEqual(['childName', 'parentEmail', 'parentName', 'parentTimeZone', 'startsAt']);
});

test('rejects a body that is not JSON', async () => {
  const res = await request(app).post('/api/bookings').set('content-type', 'application/json').send('{oops');
  expect([res.status, res.body.error.code]).toEqual([400, 'VALIDATION_FAILED']);
});

test('409 when nobody is left for that hour, or it is too soon', async () => {
  const at = { ...valid, startsAt: '2026-10-28T15:00:00Z' };
  await request(app).post('/api/bookings').send(at);
  await request(app).post('/api/bookings').send(at);
  for (const body of [at, { ...valid, startsAt: '2026-10-20T13:00:00Z' }]) {
    const res = await request(app).post('/api/bookings').send(body);
    expect([res.status, res.body.error.code]).toEqual([409, 'SLOT_UNAVAILABLE']);
  }
});

test('fetches a booking by id, and 404s otherwise', async () => {
  const made = await request(app).post('/api/bookings').send({ ...valid, startsAt: '2026-10-29T15:00:00Z' });
  const res = await request(app).get(`/api/bookings/${made.body.booking.id}`);
  expect(res.body.booking.id).toBe(made.body.booking.id);
  for (const id of [randomUUID(), 'abc']) expect((await request(app).get(`/api/bookings/${id}`)).body.error.code).toBe('NOT_FOUND');
});

test('lists slots from the app clock, full hours included', async () => {
  const res = await request(app).get('/api/slots');
  expect([res.body.now, res.body.demo]).toEqual(['2026-10-20T12:00:00.000Z', false]);
  expect(res.body.slots[0].startsAt).toBe('2026-10-20T15:00:00.000Z');
  expect(res.body.slots).toContainEqual({ startsAt: '2026-10-28T15:00:00.000Z', available: false });
});

test('lists mentors with upcoming booking times only', async () => {
  const res = await request(app).get('/api/mentors');
  expect(res.body.mentors).toHaveLength(2);
  const times = res.body.mentors.flatMap((m: MentorDto) => m.bookings);
  expect(times.length).toBeGreaterThan(0);
  expect(times.every((b: object) => Object.keys(b).join() === 'startsAt')).toBe(true);
});

test('every /api response is no-store, and unknown routes are JSON 404s', async () => {
  expect((await request(app).get('/api/slots')).headers['cache-control']).toBe('no-store');
  const res = await request(app).get('/api/nope');
  expect([res.status, res.headers['cache-control'], res.body.error.code]).toEqual([404, 'no-store', 'NOT_FOUND']);
});

test('a failing mailer never fails the booking', async () => {
  const log = vi.fn();
  const broken = createApp({ pool, clock, appUrl: '', log, mailer: createSmtpMailer('smtp://127.0.0.1:9') }); // nothing listens on port 9
  const res = await request(broken).post('/api/bookings').send({ ...valid, startsAt: '2026-10-30T15:00:00Z' });
  expect(res.status).toBe(201);
  await vi.waitFor(() => expect(log).toHaveBeenCalled());
});

test('the app clock drives slots, booking and the mentors list', async () => {
  // a clock before any real run, so a route that reads new Date() fails here
  const demo = createApp({ pool, clock: { now: () => new Date('2026-10-14T13:30:00Z'), demo: true }, mailer, appUrl: '' });
  const slots = (await request(demo).get('/api/slots')).body;
  expect([slots.now, slots.demo, slots.slots[0].startsAt])
    .toEqual(['2026-10-14T13:30:00.000Z', true, '2026-10-14T16:00:00.000Z']); // 15:00Z is under 2 hours away
  expect((await request(demo).post('/api/bookings').send({ ...valid, startsAt: '2026-10-15T15:00:00Z' })).status).toBe(201);
  const mentors = (await request(demo).get('/api/mentors')).body;
  expect(mentors.demo).toBe(true);
  expect(mentors.mentors.flatMap((m: MentorDto) => m.bookings.map((b) => b.startsAt))).toContain('2026-10-15T15:00:00.000Z');
});

test('createClock: real by default, demo clock starts at DEMO_NOW and keeps ticking', () => {
  let real = 1_000_000;
  expect(createClock(undefined, () => real)).toMatchObject({ demo: false });
  expect(createClock('', () => real).now().getTime()).toBe(1_000_000);
  const c = createClock('2026-10-20T12:00:00Z', () => real);
  expect([c.demo, c.now().toISOString()]).toEqual([true, '2026-10-20T12:00:00.000Z']);
  real += 90_000;
  expect(c.now().toISOString()).toBe('2026-10-20T12:01:30.000Z');
  expect(() => createClock('next tuesday')).toThrow(/DEMO_NOW/);
  expect(() => createClock('2026-10-20T12:00:00')).toThrow(/DEMO_NOW/); // no offset would read in the host zone
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/server/api.test.ts`
Expected: FAIL, failing to resolve `./app.ts`.

- [ ] **Step 3: Implement `src/shared/types.ts` and `src/server/app.ts`**
  - **`createClock`**: an empty or missing value means the real clock. Otherwise compute `offset = Date.parse(demoNow) - realNow()` once and return `{ now: () => new Date(realNow() + offset), demo: true }`. If `z.iso.datetime({ offset: true }).safeParse(demoNow)` fails, throw `Error('DEMO_NOW must be an ISO instant')`; `Date.parse` alone accepts `'Oct 20 2026'` and reads offset-less times in the host zone.
  - **Body schema (Zod 4)**:
    - `startsAt`: `z.iso.datetime({ offset: true })`, converted to a `Date`, then refined to be exactly on the UTC hour.
    - `parentName` and `childName`: `z.string().trim().min(1).max(80).regex(/^[^\p{Cc}]*$/u)`.
    - `parentEmail`: `z.email().max(254)`.
    - `parentTimeZone`: `z.string().max(64).refine(isValidTimeZone)`.
  - **Routes**, in this order:
    1. A middleware that sets `Cache-Control: no-store` on `/api`.
    2. `express.json()`.
    3. `GET /api/slots`: `buildSlots(loadMentors, loadActiveBookings(now − 2 days, now + 16 days), now)`. The wide margins include earlier bookings that still count toward a mentor's day.
    4. `POST /api/bookings`:
       - Call `bookSlot`.
       - Respond 201 with a `BookingDto` (load the mentor with `getBookingWithMentor`), or 409.
       - *After* responding, `await Promise.allSettled` both `mailer.send` calls and `log` any rejection.
    5. `GET /api/bookings/:id`: validate with `z.uuid()`, otherwise 404.
    6. `GET /api/mentors`: each mentor's active bookings with `startsAt ≥ now`, mapped to `{ startsAt }`.
    7. `app.use('/api', …)`: JSON 404 for unknown API routes.
    8. Only when `webDir` is given: `express.static(webDir)` and the SPA fallback `app.get('/{*splat}', …)` sending `index.html`. Express 5 needs that named wildcard.
    9. The error middleware:
       - `ZodError`: 400 `VALIDATION_FAILED`, with `fields` keyed by `issue.path.join('.')`.
       - `err.type === 'entity.parse.failed'`: 400 `VALIDATION_FAILED`.
       - Anything else: log it and return 500 `INTERNAL`.
  - `app.disable('x-powered-by')`.

- [ ] **Step 4: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/server/app.ts src/server/api.test.ts package.json package-lock.json
git commit -m "feat(api): add slots, bookings and mentors endpoints with zod validation"
```

---

### Task 8: Seed and server entry

**Files:**
- Create: `src/server/seed.ts`, `src/server/seed.test.ts`, `src/server/main.ts`
- Modify: `package.json` (scripts `"start": "node src/server/main.ts"` and `"dev:server": "node --watch src/server/main.ts"`)

**Interfaces:**
- Consumes:
  - `bookSlot`, `loadMentors`, `loadActiveBookings` (Task 5);
  - `buildSlots`, `worksAt` (Task 4);
  - `createPool`, `migrate` (Task 3);
  - `createApp`, `createClock` (Task 7);
  - `createSmtpMailer` (Task 6).
- Produces:
  - `src/server/seed.ts`:
    - `SEED_MENTORS`, an array of `{ name; email; subjects; bio; shift: 'uk' | 'us'; hours: WorkingHours[] }`;
    - `seed(pool: Pool, now: Date): Promise<{ mentors: number; preBooked: number }>`.
  - `src/server/main.ts`: the runnable server.

- [ ] **Step 1: Write the failing tests** in `src/server/seed.test.ts`. One database per test, `NOW = new Date('2026-10-20T12:00:00Z')`, and a helper `slotsNow()` that returns `buildSlots(loadMentors, loadActiveBookings(NOW − 2d, NOW + 16d), NOW)`.

```ts
test('seeds 10 mentors and is safe to repeat', async () => {
  const first = await seed(pool, NOW);
  expect(first.mentors).toBe(10);
  expect(first.preBooked).toBeGreaterThan(0);
  const hoursBefore = (await pool.query('select count(*)::int as n from mentor_hours')).rows[0].n;
  expect(await seed(pool, NOW)).toEqual({ mentors: 10, preBooked: 0 });
  expect((await pool.query('select count(*)::int as n from mentor_hours')).rows[0].n).toBe(hoursBefore);
});

test('London, New York and Los Angeles each see a fully booked day and a full hour', async () => {
  await seed(pool, NOW);
  const slots = await slotsNow();
  for (const tz of ['Europe/London', 'America/New_York', 'America/Los_Angeles']) {
    const days = Map.groupBy(slots, (s) => localDate(s.startsAt, tz));
    expect([...days.values()].some((d) => d.every((s) => !s.available))).toBe(true);             // a fully booked day
    expect([...days.values()].some((d) => d.some((s) => s.available) && d.some((s) => !s.available))).toBe(true); // a full hour among open ones
  }
});

test("London's 25 Oct still offers 1:00 AM BST and 1:00 AM GMT", async () => {
  await seed(pool, NOW);
  const open = (await slotsNow()).filter((s) => s.available).map((s) => s.startsAt.toISOString());
  expect(open).toEqual(expect.arrayContaining(['2026-10-25T00:00:00.000Z', '2026-10-25T01:00:00.000Z']));
});

test('every pre-booked class keeps the rules', async () => {
  await seed(pool, NOW);
  await expectBookingRulesHold(pool);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/server/seed.test.ts`
Expected: FAIL, failing to resolve `./seed.ts`.

- [ ] **Step 3: Implement `src/server/seed.ts`.** All mentors are `Asia/Kolkata`. Use one-sentence bios with no pronouns. Emails are `firstname.lastname@mentors.example`.

| # | Name | Subjects | Shift |
|---|---|---|---|
| 1 | Priya Sharma | Coding, Math | uk |
| 2 | Arjun Mehta | Coding | uk |
| 3 | Ananya Iyer | Math, Science | uk |
| 4 | Kavya Nair | English | uk |
| 5 | Vikram Rao | Coding, Science | uk, no Friday |
| 6 | Sneha Kulkarni | Math | us |
| 7 | Aditya Joshi | Coding | us |
| 8 | Meera Pillai | Science | us |
| 9 | Karan Malhotra | Coding, Math | us |
| 10 | Divya Reddy | English, Math | us, no Tuesday |

  - **Hours:**
    - `uk`: weekdays 1–5 `20:30–23:30`, and weekdays 0 and 6 `14:30–18:30`.
    - `us`: weekdays 0, 2, 3, 4, 5, 6 `02:30–07:30`.
  - **Mentors**: upsert by email (`on conflict (email) do update`). Replace each mentor's hours with delete + insert inside one transaction.
  - **Pre-booking** happens only when `select count(*) from bookings` is 0. Every booking goes through `bookSlot`, cycling four made-up parents (London, New York, Chicago, Los Angeles, at `parentN@example.com`).
    1. Book every open slot in `[now + 2 days, now + 2 days + 50 hours)`, calling `bookSlot` repeatedly on each slot until it returns `SLOT_UNAVAILABLE`.
    2. Then, using fresh `buildSlots` results, take the first open slot at or after `now + 5 days` whose UTC hour is 16, and book it until it's unavailable.

- [ ] **Step 4: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times.

- [ ] **Step 5: Implement `src/server/main.ts`**
  - **Environment** (§14):
    - `DATABASE_URL` defaults to `postgres://bookings:bookings@localhost:5433/bookings`.
    - `SMTP_URL` defaults to `smtp://localhost:1025`.
    - `APP_URL` defaults to `http://localhost:3000`.
    - `PORT` defaults to `3000`.
    - `DEMO_NOW` is optional.
  - **Startup sequence:**
    1. `createClock(DEMO_NOW)`.
    2. `migrate`.
    3. `seed(pool, clock.now())`.
    4. `createApp`. Pass `webDir` only when `dist/web/index.html` exists.
    5. `listen`.
  - **Startup log**: one line, `listening on <APP_URL>`, with ` (demo clock from <DEMO_NOW>)` appended when the demo clock is on.

- [ ] **Step 6: Smoke-test the server locally**

Run: `npm run dev:server`, then in another shell `curl -s localhost:3000/api/slots | head -c 200`
Expected: JSON starting `{"now":"…","demo":false,"slots":[{"startsAt":`. Then:
1. POST a booking: `curl -s -X POST localhost:3000/api/bookings -H 'content-type: application/json' -d '{"startsAt":"<an available startsAt from /api/slots>","parentName":"Asha Patel","parentEmail":"asha@example.com","childName":"Rohan","parentTimeZone":"Europe/London"}'`. Expected: 201.
2. Run `curl -s localhost:8025/api/v1/messages | grep -o '"Subject":"[^"]*"'`. Expected: two subjects, one per side.

- [ ] **Step 7: Commit**

```bash
git add src/server/seed.ts src/server/seed.test.ts src/server/main.ts package.json
git commit -m "feat(seed): seed mentors and pre-book a full day and a full hour; add server entry"
```

---

### Task 9: Booking-flow logic for the browser (pure)

**Files:**
- Create: `src/web/booking.ts`, `src/web/booking.test.ts`

**Interfaces:**
- Consumes:
  - `localDate`, `addDays`, `offsetMinutes`, `zonedTimeToInstant`, `zoneAbbreviation`, `formatZoneOption`, `canonicalTimeZone`, `isValidTimeZone` (Tasks 1–2);
  - `SlotDto` (Task 7).
- Produces (`src/web/booking.ts`):

```ts
export const DAYS_SHOWN = 14;
export const COMMON_ZONES = ['America/Los_Angeles', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/New_York',
  'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Dublin', 'Asia/Kolkata'];
export type Day = { key: string; slots: SlotDto[]; openCount: number };
export function groupIntoDays(slots: SlotDto[], tz: string, now: Date): Day[];                // exactly 14 days from today in tz
export function shownDayKey(days: Day[], selected: string | null, chosenDay: string | null, tz: string): string;
export function nearestOpenTimes(slots: SlotDto[], target: string, count?: number): string[]; // default 3, returned in time order
export function nearestOpenDays(days: Day[], key: string): { before: Day | null; after: Day | null };
export function clockChange(days: Day[], tz: string, now: Date): { dayKey: string; from: string; to: string } | null;
export function dayMixesOffsets(day: Day, tz: string): boolean;
export function zoneOptions(current: string, now: Date): { value: string; label: string; group: 'common' | 'all' }[];
export function initialTimeZone(stored: string | null, device: string): string;
export function sameZone(a: string, b: string): boolean;
export type Details = { parentName: string; parentEmail: string; childName: string };
export type FlowState = { step: 'details' | 'time'; details: Details; chosenDay: string | null; selected: string | null; unavailable: string | null };
export type FlowAction =
  | { type: 'detailsSubmitted'; details: Details } | { type: 'back' } | { type: 'daySelected'; dayKey: string }
  | { type: 'slotSelected'; startsAt: string } | { type: 'slotUnavailable'; startsAt: string };
export const initialFlow: FlowState;
export function flowReducer(state: FlowState, action: FlowAction): FlowState;
```

- [ ] **Step 1: Write the failing tests** in `src/web/booking.test.ts`. Use `NOW = new Date('2026-10-20T12:00:00Z')` and `slot(iso, available = true)`.

```ts
test('groups into exactly 14 local days starting today, ignoring later slots', () => {
  const days = groupIntoDays([slot('2026-10-20T15:00:00Z'), slot('2026-11-02T23:00:00Z'), slot('2026-11-03T10:00:00Z')], 'Europe/London', NOW);
  expect(days.map((d) => d.key)).toEqual(Array.from({ length: 14 }, (_, i) => addDays('2026-10-20', i)));
  expect(days.at(-1)!.slots.map((s) => s.startsAt)).toEqual(['2026-11-02T23:00:00Z']);
});

test('each repeated 1:00 AM lands on its own change day', () => {
  const london = groupIntoDays([slot('2026-10-25T00:00:00Z'), slot('2026-10-25T01:00:00Z')], 'Europe/London', NOW);
  expect(london.find((d) => d.key === '2026-10-25')!.slots).toHaveLength(2);
  const ny = groupIntoDays([slot('2026-11-01T05:00:00Z'), slot('2026-11-01T06:00:00Z')], 'America/New_York', NOW);
  expect(ny.find((d) => d.key === '2026-11-01')!.slots).toHaveLength(2);
});

test('openCount ignores full hours', () => {
  const [today] = groupIntoDays([slot('2026-10-20T15:00:00Z'), slot('2026-10-20T16:00:00Z', false)], 'Europe/London', NOW);
  expect(today!.openCount).toBe(1);
});

test('shownDayKey: the selected time, then the chosen day, then the first open day', () => {
  const days = groupIntoDays([slot('2026-10-22T15:00:00Z'), slot('2026-10-27T01:00:00Z')], 'America/Los_Angeles', NOW);
  expect(shownDayKey(days, '2026-10-27T01:00:00Z', '2026-10-22', 'America/Los_Angeles')).toBe('2026-10-26'); // selected wins
  expect(shownDayKey(days, null, '2026-10-24', 'America/Los_Angeles')).toBe('2026-10-24');
  expect(shownDayKey(days, null, '2026-10-19', 'America/Los_Angeles')).toBe('2026-10-22'); // dropped at midnight
  const kolkataDays = groupIntoDays([slot('2026-10-27T01:00:00Z')], 'Asia/Kolkata', NOW);
  expect(shownDayKey(kolkataDays, '2026-10-27T01:00:00Z', null, 'Asia/Kolkata')).toBe('2026-10-27'); // zone changed
});

test('nearestOpenTimes ranks by distance, returns time order, skips the target and full hours', () => {
  const slots = [slot('2026-10-27T14:00:00Z'), slot('2026-10-27T15:00:00Z'), slot('2026-10-27T16:00:00Z', false),
    slot('2026-10-27T17:00:00Z', false), slot('2026-10-27T21:00:00Z'), slot('2026-10-27T22:00:00Z')];
  expect(nearestOpenTimes(slots, '2026-10-27T16:00:00Z')).toEqual(['2026-10-27T14:00:00Z', '2026-10-27T15:00:00Z', '2026-10-27T21:00:00Z']);
});

test('nearestOpenDays looks both ways, or finds none', () => {
  const days = groupIntoDays([slot('2026-10-21T15:00:00Z'), slot('2026-10-24T10:00:00Z')], 'Europe/London', NOW);
  expect(nearestOpenDays(days, '2026-10-22')).toEqual({ before: days[1], after: days[4] });
  expect(nearestOpenDays(groupIntoDays([], 'Europe/London', NOW), '2026-10-22')).toEqual({ before: null, after: null });
});

test("clockChange finds each zone's change in the window", () => {
  const days = (tz: string) => groupIntoDays([], tz, NOW);
  expect(clockChange(days('Europe/London'), 'Europe/London', NOW)).toEqual({ dayKey: '2026-10-25', from: 'BST', to: 'GMT' });
  expect(clockChange(days('America/New_York'), 'America/New_York', NOW)).toEqual({ dayKey: '2026-11-01', from: 'EDT', to: 'EST' });
  expect(clockChange(days('Asia/Kolkata'), 'Asia/Kolkata', NOW)).toBeNull();
});

test('dayMixesOffsets is true only on the change day', () => {
  const days = groupIntoDays([slot('2026-10-25T00:00:00Z'), slot('2026-10-25T10:00:00Z'), slot('2026-10-27T15:00:00Z'), slot('2026-10-27T16:00:00Z')], 'Europe/London', NOW);
  expect(dayMixesOffsets(days.find((d) => d.key === '2026-10-25')!, 'Europe/London')).toBe(true);
  expect(dayMixesOffsets(days.find((d) => d.key === '2026-10-27')!, 'Europe/London')).toBe(false);
});

test('zoneOptions: common zones first, exactly one entry per zone, and the current spelling kept', () => {
  const calcutta = zoneOptions('Asia/Calcutta', NOW);
  expect(calcutta.slice(0, 10).map((o) => o.group)).toEqual(Array(10).fill('common'));
  expect(calcutta.filter((o) => sameZone(o.value, 'Asia/Kolkata')).map((o) => [o.value, o.label])).toEqual([['Asia/Calcutta', 'Kolkata (GMT+5:30)']]);
  expect(zoneOptions('Asia/Kolkata', NOW).filter((o) => sameZone(o.value, 'Asia/Kolkata')).map((o) => o.value)).toEqual(['Asia/Kolkata']);
  expect(calcutta.find((o) => o.value === 'Europe/London')!.label).toBe('London (GMT+1)');
});

test('initialTimeZone and sameZone', () => {
  expect(initialTimeZone('Europe/London', 'America/New_York')).toBe('Europe/London');
  expect(initialTimeZone('Mars/Base', 'America/New_York')).toBe('America/New_York');
  expect(initialTimeZone(null, 'America/New_York')).toBe('America/New_York');
  expect(sameZone('Asia/Kolkata', 'Asia/Calcutta')).toBe(true);
});

test('flowReducer keeps details through a 409 and clears the selection', () => {
  const details = { parentName: 'Asha Patel', parentEmail: 'asha@example.com', childName: 'Rohan' };
  let s = flowReducer(initialFlow, { type: 'detailsSubmitted', details });
  expect(s.step).toBe('time');
  s = flowReducer(s, { type: 'slotSelected', startsAt: '2026-10-27T16:00:00Z' });
  s = flowReducer(s, { type: 'slotUnavailable', startsAt: '2026-10-27T16:00:00Z' });
  expect(s).toMatchObject({ step: 'time', details, selected: null, unavailable: '2026-10-27T16:00:00Z' });
  expect(flowReducer(s, { type: 'daySelected', dayKey: '2026-10-28' })).toMatchObject({ chosenDay: '2026-10-28', selected: null });
  expect(flowReducer(s, { type: 'back' })).toMatchObject({ step: 'details', details });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/web/booking.test.ts`
Expected: FAIL, failing to resolve `./booking.ts`.

- [ ] **Step 3: Implement `src/web/booking.ts`**
  - **`groupIntoDays`**: the keys are `localDate(now, tz)` plus 0–13 days. Bucket each slot by `localDate(startsAt, tz)` and drop keys outside those 14.
  - **`shownDayKey`**, in order of preference:
    1. the selected slot's local day, if it's in `days`;
    2. otherwise `chosenDay`, if it's in `days`;
    3. otherwise the first day with `openCount > 0`;
    4. otherwise `days[0].key`.
  - **`nearestOpenTimes`**: only available slots other than the target. Sort by `|Δt|`, ties to the earlier slot, take `count`, then sort by time.
  - **`clockChange`**: the first day key whose offset at local noon (`zonedTimeToInstant(key, '12:00', tz)`) differs from `offsetMinutes(now, tz)`. `from` and `to` are the abbreviations at `now` and at that noon.
  - **`dayMixesOffsets`**: the day's slots have more than one distinct `offsetMinutes`.
  - **`zoneOptions`**:
    - Start with `COMMON_ZONES`, then `Intl.supportedValuesOf('timeZone')`, dropping any zone already present canonically.
    - Where an entry is canonically equal to `current`, use `current` as its `value`. If nothing matches, prepend `current` to the common group.
    - Labels come from `formatZoneOption(now, tz)`.
  - **`initialTimeZone`**: `stored` if it passes `isValidTimeZone`, otherwise `device`.
  - **`sameZone`**: compares `canonicalTimeZone` values.
  - **`flowReducer`**:
    - `detailsSubmitted`: set `step: 'time'` and `details`.
    - `back`: set `step: 'details'`.
    - `daySelected`: set `chosenDay`, and `selected: null`.
    - `slotSelected`: set `selected`, and `unavailable: null`.
    - `slotUnavailable`: set `selected: null` and `unavailable`.

- [ ] **Step 4: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times.

- [ ] **Step 5: Commit**

```bash
git add src/web/booking.ts src/web/booking.test.ts
git commit -m "feat(web): add pure day grouping, alternatives, zone options and flow reducer"
```

---

### Task 10: Web shell, API client, hooks, confirmation page

**Files:**
- Create: `index.html`, `src/web/index.css`, `src/web/main.tsx`, `src/web/App.tsx`, `src/web/api.ts`, `src/web/hooks.ts`, `src/web/ui.tsx`, `src/web/ConfirmationPage.tsx`
- Modify:
  - `vite.config.ts`: add `react()` and `tailwindcss()` plugins, `build.outDir: 'dist/web'`, and `server.proxy: { '/api': 'http://localhost:3000' }`.
  - `package.json`: dev dependencies `vite @vitejs/plugin-react react react-dom @tanstack/react-query tailwindcss @tailwindcss/vite @types/react @types/react-dom`; scripts `"dev": "vite"` and `"build": "vite build"`.
  - `tsconfig.json`: `"types": ["node", "vite/client"]`. TypeScript 7 checks side-effect imports, so `import './index.css'` needs Vite's client types.

**Interfaces:**
- Consumes:
  - the types (Task 7);
  - `initialTimeZone` (Task 9);
  - the formatters (Task 2).
- Produces:
  - `api.ts`:
    - `class ApiError extends Error { status: number; code: ErrorCode; fields: Record<string, string> }`, with fields assigned in the constructor body;
    - `getSlots(): Promise<SlotsResponse>`;
    - `getMentors(): Promise<MentorsResponse>`;
    - `getBooking(id: string): Promise<BookingResponse>`;
    - `createBooking(body: BookingRequest): Promise<BookingResponse>`.
  - `hooks.ts`:
    - `useTimeZone(): { timeZone: string; setTimeZone(tz: string): void; deviceTimeZone: string }`;
    - `useSlots()`: `useQuery` keyed `['slots']`, `refetchInterval: 60_000`;
    - `useBookSlot(onUnavailable: (startsAt: string) => void)`: `useMutation`. On success it calls `location.assign('/bookings/' + id)`. On a 409 it calls `queryClient.invalidateQueries({ queryKey: ['slots'] })` and `onUnavailable(variables.startsAt)`.
  - `ui.tsx`, using the sizes from spec §10:
    - `Card({ children })`: `rounded-card border border-line bg-white shadow-card`, 32px padding, up to 440px wide, full width on phones;
    - `CardTitle()`: "Book a FREE class for your child", 24px medium, with "FREE" underlined in `decoration-brand`;
    - `Progress({ step: 1 | 2 | 3 })`: three 64×4px segments, `bg-brand` up to `step` and `bg-line` after;
    - `DemoBanner({ now: string; timeZone: string })`: takes `now` as the server's ISO string.
  - Every primary button is full width, 14px bold, with 16px vertical padding, `rounded-cta bg-brand text-ink`.
  - `App.tsx`: a `location.pathname` switch, with routes added by Tasks 11–12.

- [ ] **Step 1: Write the styles and entry**
  - **`index.css`**:
    - `@import "tailwindcss";`
    - the `@theme` block copied **verbatim** from spec §10;
    - `body` uses `bg-page text-ink antialiased`;
    - a visible `:focus-visible` outline in `brand`.
  - **`index.html`**:
    - Fontshare's Satoshi `<link>` (spec §10);
    - `<div id="root">`;
    - `<script type="module" src="/src/web/main.tsx">`.
  - **`main.tsx`**: a `QueryClientProvider` whose queries don't retry `ApiError` with `status < 500`.

- [ ] **Step 2: Implement `api.ts`, `hooks.ts`, `ui.tsx`, `App.tsx` and `ConfirmationPage.tsx`**
  - **`useTimeZone`**:
    - Initial state is `initialTimeZone(read('tz'), device)`, where `device` is `Intl.DateTimeFormat().resolvedOptions().timeZone`.
    - `setTimeZone` writes `localStorage.tz`.
    - Wrap both the read and the write in `try`.
  - **App**:
    - Header: a "Codeyoung" wordmark (`<a href="/">`) and an `<a href="/mentors">` link labelled "Our mentors".
    - Routes: `/^\/bookings\/([0-9a-f-]{36})$/` renders `ConfirmationPage`, and anything else renders a not-found card with a link home.
  - **ConfirmationPage** (spec §10), using `useQuery({ queryKey: ['booking', id], queryFn: () => getBooking(id) })`:
    - `Progress step={3}`.
    - "You're booked!"
    - "{childName}'s free trial class"
    - `formatDateWithYear`, then `formatSpan(start, end, parentTimeZone)`.
    - "Your mentor joins from {city}, where it's {formatOtherTime(start, mentor zone, parentTimeZone)}."
    - A mentor card with initials, name, subjects and bio.
    - A "Join class" button linking `classLink`, with the link text shown beneath it.
    - "We've emailed this to {parentEmail}."
    - A 404 shows "We couldn't find that booking." and a link home.
  - **DemoBanner** text: `Demo clock: it's ${formatDateWithYear(now, tz)}, ${formatTime(now, tz)} in ${cityName(tz)}`.

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: exit 0, and `dist/web/index.html` exists.

- [ ] **Step 4: Check it in the browser**
  1. Start `npm run dev:server` and `npm run dev`.
  2. Create a booking: `curl -s -X POST localhost:3000/api/bookings -H 'content-type: application/json' -d '{"startsAt":"<an available startsAt from /api/slots>","parentName":"Asha Patel","parentEmail":"asha@example.com","childName":"Rohan","parentTimeZone":"Europe/London"}'`.
  3. Open `http://localhost:5173/bookings/<id>`.

Expected:
- The confirmation matches spec §10.
- A made-up UUID shows the not-found copy.
- `/nope` shows the not-found card.

- [ ] **Step 5: Commit**

```bash
git add index.html vite.config.ts tsconfig.json package.json package-lock.json src/web/index.css src/web/main.tsx src/web/App.tsx src/web/api.ts src/web/hooks.ts src/web/ui.tsx src/web/ConfirmationPage.tsx
git commit -m "feat(web): add shell, palette, api client, hooks and confirmation page"
```

---

### Task 11: Booking page

**Files:**
- Create: `src/web/BookingPage.tsx`
- Modify: `src/web/App.tsx` (route `/` → `BookingPage`)

**Interfaces:**
- Consumes:
  - `useTimeZone`, `useSlots`, `useBookSlot` (Task 10);
  - every export of `src/web/booking.ts` (Task 9);
  - the formatters (Task 2);
  - `Card`, `CardTitle`, `Progress`, `DemoBanner` (Task 10).

- [ ] **Step 1: Implement `BookingPage.tsx`** following spec §10. These decisions aren't in the spec:
  - **State**: `useReducer(flowReducer, initialFlow)`. Compute these in render, never in an effect:
    - `days = groupIntoDays(slots, timeZone, new Date(data.now))`;
    - `key = shownDayKey(…)`.
  - **Step 1 form**:
    - `required` fields, `type="email"`, `maxLength={80}`.
    - On submit, dispatch `detailsSubmitted` with trimmed values.
  - **Zone pill**:
    - The visible pill shows a globe icon, `cityName(timeZone)` and a chevron.
    - A native `<select>` covers it with `absolute inset-0 opacity-0`. It has an accessible name ("Time zone") and two optgroups, "Common" and "All time zones", built from `zoneOptions(timeZone, now)`.
    - If `!sameZone(timeZone, deviceTimeZone)`, show "Your device is set to {city} time." with a button "Use {city} time".
  - **Days and slots**:
    - Both are native radios in a `<fieldset>` with an `sr-only` legend. Each `<input class="sr-only peer">` is styled through `peer-checked:` / `peer-focus-visible:` / `peer-disabled:`.
    - Chip footer: "1 slot", "{n} slots", or "Full".
    - Arrow buttons scroll the chip row by its own width.
  - **Notices and alerts**, using the spec §10 copy:
    - The clock-change notice shows when `key >= change.dayKey`: "Clocks in {city} change on {formatDayKey(change.dayKey)}. Times from then on are {to}, not {from}." A mixed day appends "On this day each time shows its zone." and its slot labels include `zoneAbbreviation`.
    - Under the grid when any hour is full: "Greyed-out times are full: every mentor is booked then."
    - Empty day: "Every mentor is booked on {day}.", then "The nearest days with open times:" with buttons "{day} · {n} times". If there are none on either side: "No times are open in the next 14 days. Please check back soon."
    - On a 409, a `role="alert"` box: "Sorry, {time} on {date} is no longer available." and "The nearest open times are below. Pick one and confirm again. Your details are kept." It has buttons from `nearestOpenTimes`, and a label includes the date when it isn't the shown day.
  - **Confirm button**:
    - Label: "Confirm {formatDate}, {formatTime} {abbr}", or "Choose a time" when nothing is selected.
    - **Disabled while `book.isPending || book.isSuccess`**, and the label reads "Booking…". `isSuccess` covers the gap between the response and the page unloading after `location.assign`.
  - **Focus**: when the step changes, move focus to the step heading (`tabIndex={-1}`).
  - **Demo banner**: show it above the card when `data.demo`.
  - **Loading and errors**: "Loading times…" while loading. On a load error: "We couldn't load times." with a "Try again" button that calls `refetch`.

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: exit 0.

- [ ] **Step 3: Check every state in the browser**
  - **Setup:** `docker compose down -v && docker compose up -d db mailpit`, then `DEMO_NOW=2026-10-20T12:00:00Z npm run dev:server` and `npm run dev`. Use the browser with the zone set to London.

Expected:
1. **Step 1** blocks empty or invalid fields natively.
2. **Step 2**:
   - shows 14 chips with counts, including at least one "Full" day from the seed;
   - Sun 25 Oct lists "1:00 AM BST" and "1:00 AM GMT";
   - Tue 27 Oct shows the GMT notice;
   - a full hour is greyed with "Full".
3. **A full day** shows the nearest open days.
4. **The 409 path:** pick the same last free hour in two tabs and confirm both. The second shows the alert with three alternatives, and the details are kept.
5. **Double-clicking Confirm** creates one booking: Mailpit gets 2 emails, not 4.
6. **Zone change:** switch to "New York" after picking a time. The time stays selected on its New York day.
7. **Keyboard:** tab and arrow keys move through chips and slots with a visible focus.
8. **Phone width (375px):** no horizontal page scroll.

Take a screenshot of each state with the browser tool.

- [ ] **Step 4: Commit**

```bash
git add src/web/BookingPage.tsx src/web/App.tsx
git commit -m "feat(web): add the booking page with zone pill, day chips, full and 409 states"
```

---

### Task 12: Mentors page

**Files:**
- Create: `src/web/MentorsPage.tsx`
- Modify:
  - `src/web/App.tsx`: route `/mentors` → `MentorsPage`.
  - `src/web/booking.ts` and `src/web/booking.test.ts`: add `mentorDays`.

**Interfaces:**
- Consumes:
  - `getMentors` (Task 10);
  - the formatters (Task 2);
  - `DemoBanner`, `Card` (Task 10).
- Produces: `mentorDays(bookings: { startsAt: string }[], tz: string): { key: string; times: string[]; atCap: boolean }[]`, sorted by key, with each day's times sorted.

- [ ] **Step 1: Write the failing test** (append to `src/web/booking.test.ts`)

```ts
test("mentorDays groups by the mentor's own day and marks the cap", () => {
  const days = mentorDays([{ startsAt: '2026-10-27T22:00:00Z' }, { startsAt: '2026-10-27T16:00:00Z' }, { startsAt: '2026-10-28T15:00:00Z' }], 'Asia/Kolkata');
  expect(days).toEqual([
    { key: '2026-10-27', times: ['2026-10-27T16:00:00Z'], atCap: false },
    { key: '2026-10-28', times: ['2026-10-27T22:00:00Z', '2026-10-28T15:00:00Z'], atCap: true }, // 3:30 AM and 8:30 PM in Kolkata
  ]);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/web/booking.test.ts -t mentorDays`
Expected: FAIL, `TypeError: mentorDays is not a function`.

- [ ] **Step 3: Implement `mentorDays` and `MentorsPage.tsx`**
  - **`mentorDays`**: `atCap` means `times.length >= 2`.
  - **The page** uses `useQuery({ queryKey: ['mentors'], queryFn: getMentors })`, plus `DemoBanner` when `demo`. Its heading is "Our mentors", and the cards sit in a 1-column grid on phones and 2 columns from `md` up. Each card shows:
    - initials;
    - the name;
    - "Teaches from {cityName} · {zoneAbbreviation(now)}";
    - subject chips;
    - the bio;
    - "Booked trial classes, in {first name}'s time", listing each time as "{formatDayKey(key)} · {formatTime} {abbr}". The cap day gets the badge "2 of 2 that day".
  - With no bookings, the card says "No trial classes booked yet."
  - The page footer says "Times only, no parent or child names."

- [ ] **Step 4: Run the tests, typecheck and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS, exit 0.

- [ ] **Step 5: Check it in the browser**

Setup: `docker compose down -v && docker compose up -d db mailpit`, then `DEMO_NOW=2026-10-20T12:00:00Z npm run dev:server` and `npm run dev`. Open `http://localhost:5173/mentors`.
Expected: 10 cards, with seeded classes listed in IST and at least one "2 of 2 that day" badge, as spec §10 describes.

- [ ] **Step 6: Commit**

```bash
git add src/web/MentorsPage.tsx src/web/App.tsx src/web/booking.ts src/web/booking.test.ts
git commit -m "feat(web): add the mentors showcase with booked times in each mentor's own zone"
```

---

### Task 13: Docker image and the full stack

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Modify: `docker-compose.yml` (add `app` and `test`)

**Interfaces:**
- Consumes: `npm run build`, `npm test`, `src/server/main.ts`.
- Produces: `docker compose up` (the app on 3000, Mailpit on 8025) and `docker compose run --rm --build test`.

- [ ] **Step 1: Write the files**
  - **`.dockerignore`**: `node_modules`, `dist`, `.git`, `.playwright-mcp`, `.superpowers`, `docs`, `*.pdf`.
  - **`Dockerfile`**:

```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM deps AS test
COPY . .
CMD ["npm", "test"]

FROM node:24-alpine AS runtime
ENV NODE_ENV=production TZ=UTC
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY migrations ./migrations
COPY src/shared ./src/shared
COPY src/server ./src/server
COPY --from=build /app/dist/web ./dist/web
EXPOSE 3000
CMD ["node", "src/server/main.ts"]
```

  - **`app` service**:
    - `build: { context: ., target: runtime }`, ports `"3000:3000"`.
    - Environment: `DATABASE_URL: postgres://bookings:bookings@db:5432/bookings`, `SMTP_URL: smtp://mailpit:1025`, `APP_URL: http://localhost:3000`, `PORT: "3000"`, `TZ: UTC`, `DEMO_NOW: ${DEMO_NOW:-}`.
    - `depends_on: { db: { condition: service_healthy }, mailpit: { condition: service_started } }`.
    - `healthcheck: { test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/slots"], interval: 2s, retries: 30 }`. Busybox `wget` ships in `node:24-alpine`. This lets `docker compose up --wait` return only once the app is serving, so nothing needs a `sleep`.
  - **`test` service**:
    - `build: { context: ., target: test }`, `profiles: [test]`.
    - Environment: the same `DATABASE_URL`, plus `TZ: UTC`.
    - `depends_on: { db: { condition: service_healthy } }`.

- [ ] **Step 2: Bring the stack up from scratch**

Run: `docker compose down -v && docker compose up --build -d --wait && docker compose logs app | tail -n 5`
Expected: `listening on http://localhost:3000`.
- If the log shows a TypeScript syntax error instead, Node's type stripping failed in the image. Switch to the spec's fallback: a `tsc` build stage that emits JS for `src/server` and `src/shared`, run with `node`. Don't add another runner.

- [ ] **Step 3: Smoke-test the stack**

Run: `curl -s localhost:3000/api/slots | head -c 120; curl -s localhost:3000/ | grep -c 'id="root"'`
Expected: JSON starting `{"now":`, then `1`. Then:
1. Book through the UI at `localhost:3000`.
2. Check that both emails appear at `localhost:8025`.

- [ ] **Step 4: Run the suite in Docker**

Run: `docker compose run --rm --build test`
Expected: all tests pass, three times (UTC, Chatham and Los Angeles).

- [ ] **Step 5: Check the demo clock end to end**

Run: `docker compose down -v && DEMO_NOW=2026-10-20T12:00:00Z docker compose up -d --wait && curl -s localhost:3000/api/slots | head -c 60`
Expected: `{"now":"2026-10-20T12:00:…","demo":true`.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml
git commit -m "feat(docker): one compose up migrates, seeds and serves; add test service"
```

---

### Task 14: README and final pass

**Files:**
- Create: `README.md`. Do not create or touch `TRANSCRIPT.md`; the author adds it after this plan.
- Delete: `docs/red-run.txt`, after its content is quoted in the README.

**Interfaces:**
- Consumes: everything.

- [ ] **Step 1: Write `README.md`** with the sections listed in spec §15, in that order. The following wording is required, **verbatim**:
  - **Cap rule:** "at most 2 active trial classes per mentor per calendar day in the mentor's own time zone".
  - **Missing hour:** "Working hours that start inside the gap move forward by the skipped hour: 2:00 becomes 3:00, and 2:30 becomes 3:30."
  - **Ireland:** "code that reads a DST flag can get Ireland backwards, depending on which format of the data a library uses".
  - **The demo clock:**
    - `docker compose down -v`, then `DEMO_NOW=2026-10-20T12:00:00Z docker compose up`;
    - it starts again from `DEMO_NOW` whenever the app restarts.
  - **The edge-case table and examples** from spec §7.
  - **The API reference**, with one curl example per endpoint and the error shape.
  - **Tests:** `docker compose run --rm --build test` (or `npm test` with `db` up). The suite runs under `TZ=UTC`, `TZ=Pacific/Chatham` and `TZ=America/Los_Angeles`: Chatham is ahead of UTC and Los Angeles is behind it, like every US parent's browser.
  - **"How we know the race test bites"**: the failing output from `docs/red-run.txt`.
  - **Assumptions and trade-offs**: the spec's non-goals, the `ponytail:` notes, and Intl-only (with Temporal as the upgrade path).

- [ ] **Step 2: Final verification**

Run: `npm run typecheck && docker compose down -v && docker compose up --build -d --wait && docker compose run --rm --build test`
Expected: exit 0, and all three test runs pass. Then click through `/`, a confirmation page and `/mentors` at `localhost:3000`, once without and once with `DEMO_NOW`.

- [ ] **Step 3: Commit**

```bash
git add README.md && git rm docs/red-run.txt
git commit -m "docs: add readme with dst and concurrency notes"
```
