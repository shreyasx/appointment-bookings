# Task 4 report: slot rules (pure)

Status: DONE. Commit `b814184 feat(slots): turn weekly hours into utc class starts with cap and dst rules`.

## What I implemented
`src/server/slots.ts`, exporting exactly the brief's names and types: `CLASS_MINUTES`, `LEAD_MINUTES`, `HORIZON_DAYS`, `DAILY_CAP`, `WorkingHours`, `Mentor`, `ActiveBooking`, `Slot`, `isBookableTime`, `worksAt`, `classStarts`, `buildSlots`.

- A private `windows(mentor, date)` helper returns the mentor's `[open, close]` epoch-ms pairs for one of their own calendar days. It uses `weekdayOf(date)` and `zonedTimeToInstant`. `classStarts` and `worksAt` both go through it, so they cannot disagree.
- `classStarts` loops the mentor's local dates from `addDays(localDate(from, tz), -1)` to `addDays(localDate(to, tz), 1)`. For each window it rounds the open time up to the UTC hour and steps one hour at a time while `start + 60 min <= close`. It keeps starts inside `[from, to]` and returns them deduplicated (a `Set`) and sorted.
- `worksAt` checks `localDate(startsAt, tz)` only: the class must start at or after the window's open time and end at or before its close.
- `isBookableTime` requires `getTime() % 3_600_000 === 0` and `[now + 120 min, now + 14 days]`, both ends inclusive.
- `buildSlots` takes `classStarts` over `[now + 120 min, now + 14 d]` for each mentor. A (mentor, start) pair is open when that mentor has no booking at that instant and their count for `localDate(start, mentor.timeZone)` is below `DAILY_CAP`. The cap count comes from `ActiveBooking.mentorLocalDate`; the slot's own day comes from `localDate` in the mentor's zone, never the UTC or host date. Pairs merge by instant with OR, and the output is sorted.
- All time-zone work goes through `src/shared/time.ts`. No local-time `Date` methods (grep confirmed).

## TDD evidence
RED: `npx vitest run src/server/slots.test.ts`, run with only the test file present.
```
 FAIL  src/server/slots.test.ts [ src/server/slots.test.ts ]
Error: Cannot find module './slots.ts' imported from /Users/shreyasjamkhandi/Documents/dev/appointment-bookings/src/server/slots.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```
This was expected because `slots.ts` did not exist yet.

GREEN: `npx vitest run src/server/slots.test.ts`
```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

## Tests run
- Focused: 10 of 10 pass.
- `npm run typecheck` (`tsc`): clean.
- `npm test` (UTC, Pacific/Chatham, America/Los_Angeles), with the `db` container up: 3 test files and 59 tests pass in each of the three runs, with no warnings or stray output.

## Files changed
- `src/server/slots.ts` (new)
- `src/server/slots.test.ts` (new, the brief's test code verbatim)

## Self-review
- Tests match the brief verbatim. They cover the window bounds, the open/full merge, the cap, the Los Angeles and mentor-day cases, both New York clock changes and `worksAt`.
- No speculative abstractions. The only helper is `windows`, which is used twice.
- Docker `db` and `mailpit` were left running. The assignment PDF and `.superpowers/` were not committed. The commit message is all lowercase with no trailer.

## Concerns
None. One behaviour to know about: `worksAt` does not require `startsAt` to be on the UTC hour. `isBookableTime` owns that rule, and Task 5 should call both.

## Fix round 1 (comment-only)
Commit `5496479 chore(slots): fix two comments`, on top of `dd2c2b0` (no rebase or amend).

- `src/server/slots.test.ts:79`: `// 10:30-11:30 PM IST` is now `// 10:30-11:30 PM in Kolkata`, which satisfies the wording rule. `grep -n IST` finds nothing in either slots file.
- `src/server/slots.ts:37`: the padding comment is now `// a day either side is purely defensive; walking the mentor's own local dates already covers a UTC-date straddle`.

Checks:
- `npx vitest run src/server/slots.test.ts`: 1 file passed, 10 of 10 tests passed.
- `npm run typecheck`: clean.
- Only comments changed, so I did not re-run the full three-zone suite.
