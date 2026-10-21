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

