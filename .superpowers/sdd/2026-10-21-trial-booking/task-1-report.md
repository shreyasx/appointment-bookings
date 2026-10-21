# Task 1 report: project scaffold and time conversions

**Status:** DONE

**Commit:** `4ced656 feat(time): add intl-only zone conversions with dst gap and overlap rules` (on `main`, no trailer, whole message lowercase)

## What I implemented
- `package.json`: `"private": true`, `"type": "module"`, `engines.node >=22.18`, scripts `test` (three host zones: UTC, Pacific/Chatham, America/Los_Angeles) and `typecheck` (`tsc`). Dev deps installed: `typescript ^7.0.2`, `vitest ^5.0.5`, `@types/node ^26.6.5` (what `npm i -D` resolves today). I removed the noise `npm init -y` adds (`main`, `keywords`, `author`, `license`, `bugs`, `homepage`, `directories`, `description`). `npm pkg set private=true` had stored the string `"true"`, which I fixed to a real boolean. The `repository` field is what `npm init` read from the git remote.
- `tsconfig.json` and `vite.config.ts`: verbatim from the brief.
- `src/shared/time.ts`, headed with the `ponytail:` comment:
  - `isValidTimeZone`: true only for `UTC` or a name containing `/`, and only if `Intl.DateTimeFormat` doesn't throw.
  - `offsetMinutes`: parses `timeZoneName: 'longOffset'` (`GMT+05:30`, plain `GMT` for zero). The regex also accepts U+2212 as the minus sign. It throws on an unparseable value.
  - `localDate`: built from `formatToParts`.
  - `weekdayOf`, `addDays`: `Date.UTC` arithmetic, `getUTCDay`, `toISOString`.
  - `zonedTimeToInstant`: the brief's algorithm verbatim (`'compatible'` behaviour).
  - Formatters cached in a module-level `Map` keyed by locale, zone and JSON-stringified options.
- `src/shared/time.test.ts`: the brief's tests verbatim.

## TDD evidence
RED: `npx vitest run src/shared/time.test.ts` (before `time.ts` existed)
```
 FAIL  src/shared/time.test.ts [ src/shared/time.test.ts ]
Error: Cannot find module './time.ts' imported from .../src/shared/time.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```
This was expected: the implementation file did not exist.

GREEN: `npx vitest run src/shared/time.test.ts`
```
 Test Files  1 passed (1)
      Tests  29 passed (29)
```

## Full verification
`npm test` ran all three host zones:
- `TZ=UTC`: 1 file, 29 tests passed.
- `TZ=Pacific/Chatham`: 1 file, 29 tests passed.
- `TZ=America/Los_Angeles`: 1 file, 29 tests passed.

`npm run typecheck`: no output, exit 0. `tsc --listFiles` confirms it covers `src/shared/time.ts`, `src/shared/time.test.ts` and `vite.config.ts`.

## Files changed
`package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `src/shared/time.ts`, `src/shared/time.test.ts`. Nothing else was committed. The assignment PDF stays untracked, and `.gitignore` and `docs/` were not touched.

## Self-review
- No local-time `Date` methods and no `toLocaleString`. A grep for `getHours`, `getDate(`, `getDay(`, `setHours`, `toLocaleString` and `new Date(y, ...)` in `time.ts` returned nothing.
- Every `Intl.DateTimeFormat` gets an explicit `timeZone`.
- Only erasable syntax. The `.ts` extension is on the test's relative import. There are no type-only imports yet.
- I hand-traced the two gap cases (New York 02:00, London 01:30) through the algorithm; both give the expected instants.
- A zone that fails validation never enters the formatter cache, because the constructor throws before `set`.

## Concerns
- `@types/node` resolved to 26.x while the local runtime is Node 22. This is fine today, since only the `process` and `Intl` surface is used. If a later task uses a Node API that is missing in 22 or 24 (the Docker image), tsc won't catch it.
- TypeScript 7 and vitest 5 are installed, as the controller expected. `tsc` works cleanly with the brief's `tsconfig.json` on TypeScript 7.

---

## Fix round 1

**Commit:** `fix(time): bound the formatter cache and pin node types to the engines floor` (lowercase, no trailer, files added by name: `package.json`, `package-lock.json`, `src/shared/time.ts`).

1. **Unbounded formatter cache.** In `formatter()`, the map is now cleared before inserting once it holds more than 500 entries: `if (formatters.size > 500) formatters.clear(); // ponytail: clear-all past 500 entries; an LRU if real zones ever churn`. Real zone spellings number far fewer than 500, so a normal run never clears; only case-variant spam from a request body would.
   - **No test added.** The map is module-private, and proving the bound would mean exporting the cache or its size, which the instruction ruled out. An indirect check (for example validating 600 case variants and asserting results) would pass with or without the fix, so it would prove nothing.
2. **`@types/node` pinned to the engines floor.** `npm i -D @types/node@^22` resolved to `^22.20.5` (installed 22.20.5), so `tsc` now checks against the Node 22 surface. This also closes the concern raised in the first report.
3. **Lockfile drift.** The `npm i` in step 2 rewrote `package-lock.json`. The root entry (`packages[""]`) now has `name`, `version`, `devDependencies` (including `@types/node ^22.20.5`) and `engines`, with no `license`, matching `package.json`. `repository` and `version` left as they were.

**Verification**
- `npm test`: 29/29 passed under each of `TZ=UTC`, `TZ=Pacific/Chatham` and `TZ=America/Los_Angeles`.
- `npm run typecheck`: no output, exit 0.
