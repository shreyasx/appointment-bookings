# Task 9 report: booking-flow logic for the browser

Commit: `e279d17 feat(web): add pure day grouping, alternatives, zone options and flow reducer` (on `main`, no trailer, all lowercase).

## What I implemented

`src/web/booking.ts` (new, first file under `src/web/`), pure TypeScript with no React or DOM. It exports every name and signature from the brief verbatim:
`DAYS_SHOWN`, `COMMON_ZONES`, `Day`, `groupIntoDays`, `shownDayKey`, `nearestOpenTimes`, `nearestOpenDays`, `clockChange`, `dayMixesOffsets`, `zoneOptions`, `initialTimeZone`, `sameZone`, `Details`, `FlowState`, `FlowAction`, `initialFlow`, `flowReducer`.

- **Day keys** come only from `localDate`/`addDays`. No local-time `Date` getter and no `Date.now()` / `new Date()` appear in the file (grep clean). `now` is always a parameter.
- **`groupIntoDays`**: 14 keys from `localDate(now, tz)`; each slot goes into the `Map` bucket for `localDate(startsAt, tz)`, and slots outside the window are dropped. Input order is kept within a day (the server already sends them sorted).
- **`shownDayKey`**: the selected slot's local day in the current `tz` if it is in `days` (Review Focus 2: the time stays on screen after a zone change), else `chosenDay` if in `days`, else the first day with `openCount > 0`, else `days[0]`.
- **`nearestOpenTimes`**: compares by `getTime()`, so a differently formatted ISO string for the same instant is still recognised as the target. Sorts by `|Δt|` with ties to the earlier slot, takes `count` (default 3), then sorts by time.
- **`nearestOpenDays`**: among days with `openCount > 0`, the last one with a key before `key` and the first one after it. The keys are `YYYY-MM-DD`, so string comparison is date order.
- **`clockChange`**: first day whose offset at local noon (`zonedTimeToInstant(key, '12:00', tz)`) differs from `offsetMinutes(now, tz)`; `from`/`to` are `zoneAbbreviation` at `now` and at that noon.
- **`dayMixesOffsets`**: `Set` of `offsetMinutes` over the day's slots has more than one value.
- **`zoneOptions`** (Review Focus 4): walks `COMMON_ZONES` and then `Intl.supportedValuesOf('timeZone')`, keeping a `Set` of `canonicalTimeZone` values so each real zone appears once, first spelling wins. The entry canonically equal to `current` takes `current` as its `value`. If no entry matched at all (for example `UTC`, which `supportedValuesOf` lacks on Node 22), `current` is prepended to the common group. Labels come from `formatZoneOption(now, value)`.
- **`initialTimeZone`**: `stored` if truthy and `isValidTimeZone`, else `device`. **`sameZone`**: equality of `canonicalTimeZone`.
- **`flowReducer`**: exactly the transitions in the brief. The switch is exhaustive, so `tsc` checks that every action is handled.

`src/web/booking.test.ts` (new): the brief's tests verbatim, plus one `test.each` I added for Review Focus 4. For `current` in `UTC`, `Europe/Paris`, `Europe/Kiev` and `Asia/Calcutta` it asserts that exactly one option's `value` equals `current` and that no real zone appears twice (checked by resolving each option through `Intl`, not through my own helper). The brief's test only covers the Kolkata case, and the bug it guards against (blank select) also bites for `UTC` and for zones that ICU spells differently from the list.

## Interpretation call to confirm

The brief says "If nothing matches, prepend `current` to the common group." I read "nothing matches" as nothing in the whole combined list (common plus ICU list), so a mid-list zone such as `Europe/Paris` stays in its alphabetical place in the `all` group and the common group remains exactly the 10 fixed zones. Only `UTC` (or a zone absent from ICU's list) gets prepended. The alternative reading (prepend whenever `current` is not in `COMMON_ZONES`) would make the common group 11 long for most parents and need a dedupe in the `all` group. Say so if you meant that.

## Tests

RED, before `booking.ts` existed:

```
$ npx vitest run src/web/booking.test.ts
 FAIL  src/web/booking.test.ts [ src/web/booking.test.ts ]
Error: Cannot find module './booking.ts' imported from .../src/web/booking.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```

Expected: the module did not exist yet.

GREEN, focused:

```
$ npx vitest run src/web/booking.test.ts
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

Full suite, all three host zones (`npm test`, with the `db` and `mailpit` containers up):

```
 Test Files  8 passed (8)    Tests  105 passed (105)    (TZ=UTC)
 Test Files  8 passed (8)    Tests  105 passed (105)    (TZ=Pacific/Chatham)
 Test Files  8 passed (8)    Tests  105 passed (105)    (TZ=America/Los_Angeles)
```

`npx tsc`: no errors.

## Files changed

- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/src/web/booking.ts` (new)
- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/src/web/booking.test.ts` (new)

## Self-review

- Completeness: every export in the brief's interface block is present with the stated signature; every `Step 3` rule is implemented.
- Time rules: no local getters, no device clock, no `new Date(y, m, d)`, no `toLocaleString`; `new Date(isoString)` is only used to get an instant that is then handed to `localDate` / `offsetMinutes`.
- YAGNI: no helper types beyond the brief's, no caching layer. `days[0]!` in `shownDayKey` relies on `groupIntoDays` always returning 14 days (documented by its signature, "exactly 14").
- Tests check behaviour and run clean (no console noise).

## Concerns

1. **`zoneOptions` cost.** One call takes about 25-35 ms in Node (418 options). It builds two `Intl.DateTimeFormat` per zone (`canonicalTimeZone`, then the offset formatter in `formatZoneOption`), which is about 840 formatters, and `time.ts` clears its cache once it passes 500 entries, so the cache never holds them all between calls. Task 11 has no `useMemo`, so it should call `zoneOptions` only where the picker renders (not on every keystroke in the details form) or accept the cost. I did not touch `time.ts` (out of scope); if it matters, raising the cache bound there to about 1000 would remove the rebuilds.
2. `clockChange` samples local noon only, as the brief specifies. A zone whose change happens after noon local time would be reported a day late. None of the zones we serve does that.
3. `groupIntoDays` / `shownDayKey` / `dayMixesOffsets` throw a `RangeError` on a malformed `startsAt`. The server always sends ISO strings, so I did not add handling.

---

# Fix round 1

Commit: see the hash below (`perf(web): cache zone options per hour and guard the device zone`, on `main`, lowercase, no trailer, files added by name). Files: `src/web/booking.ts`, `src/web/booking.test.ts`. `time.ts` untouched.

## What changed

1. **`zoneOptions` memoised** at module level: `zoneOptions` now computes `key = current|floor(now / 3_600_000)` and reuses the one cached `{ key, options }` (`let last`) when the key matches, else calls the old body, now `buildZoneOptions`. The same array is returned for the same key, so a re-render does not rebuild ~840 formatters. Marked with a `// ponytail:` comment naming the measured ~30 ms. The labels refresh within an hour because the UTC hour is part of the key. I extracted a `ZoneOption` type alias to avoid repeating the inline object type three times.
2. **`initialTimeZone`** returns `stored` if valid, else `device` if valid, else `'UTC'`.
3. **`nearestOpenTimes` tie test** added: open 15:00 and 17:00 around 16:00 with `count = 1` returns the 15:00 slot. It passed on the existing code, because the sort already breaks ties toward the earlier slot; it pins the behaviour from here on.
4. **Reducer assertion**: `slotSelected` after `slotUnavailable` sets `selected` and clears `unavailable` to `null`. It also passed on the existing code, for the same reason.

Also added one test for the cache itself: the same array comes back for the same zone one minute later, a different array for one hour later, and another zone gets its own options.

## RED (new tests against the previous `booking.ts`)

```
$ npx vitest run src/web/booking.test.ts      # with HEAD's booking.ts
 × zoneOptions returns the same array for the same zone and hour, and a fresh one when either changes
 × initialTimeZone and sameZone
AssertionError: expected [ { …(3) }, …(417) ] to be [ { …(3) }, …(417) ] // Object.is equality
AssertionError: expected 'Mars/Base' to be 'UTC' // Object.is equality
 Tests  2 failed | 15 passed (17)
```

Expected: the old code built a new array every call and returned the junk device zone. The tie and reducer assertions passed on the old code (item 3 and 4 above).

## GREEN

```
$ npx vitest run src/web/booking.test.ts
 Test Files  1 passed (1)   Tests  17 passed (17)

$ npm test
 Test Files  8 passed (8)   Tests  107 passed (107)    (TZ=UTC)
 Test Files  8 passed (8)   Tests  107 passed (107)    (TZ=Pacific/Chatham)
 Test Files  8 passed (8)   Tests  107 passed (107)    (TZ=America/Los_Angeles)

$ npm run typecheck
 tsc: no errors
```

## Note for Task 11

The cache is one entry. `zoneOptions` returns a shared array, so callers must not mutate it.
