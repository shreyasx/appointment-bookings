# Task 5 report: booking transaction and data access

Status: DONE. Commit `2fb4649 feat(bookings): book with a per-mentor row lock and prove the race test bites` on `main`. No attribution trailer, all lowercase.

## What I implemented

`src/server/bookings.ts` (new)
- Types `BookingInput`, `Booking`, `BookResult` as in the brief; `newClassLink()` = `https://classroom.example/trial/${randomUUID()}`.
- `loadMentors(pool)`: two queries (mentors, then `mentor_hours` ordered by mentor, weekday, start) merged in JS; `time` values trimmed to `'HH:MM'`; rows mapped to camelCase; ordered by id.
- `loadActiveBookings(pool, from, to)`: `cancelled_at is null and from <= starts_at < to`.
- `bookSlot(pool, input, now, hooks?)`, following spec §6 step by step:
  1. `isBookableTime` first, else `SLOT_UNAVAILABLE`.
  2. Candidates = `loadMentors` filtered by `worksAt`; one `group by mentor_id, mentor_local_date` count query; sorted by count on `localDate(startsAt, mentor.timeZone)`, then id.
  3. Per candidate: one client, `begin` (read committed), `select id from mentors where id = $1 for update` (commented with the turnstile line from the brief), then an active-booking check at `(mentor_id, starts_at)` (rollback and next candidate), then the day count against `DAILY_CAP` (rollback and next), then `hooks?.beforeInsert?.()`, `insert ... returning *`, `commit`. Error `23505`: rollback and next candidate; any other error: rollback and rethrow. Client released in `finally`.
  4. No candidate succeeded: `SLOT_UNAVAILABLE`.
  It never sends email and never calls `now()` in SQL.
- `getBookingWithMentor(pool, id)`: the booking row plus its mentor (found in `loadMentors`), or `null`.

`src/server/test-db.ts`: added `expectBookingRulesHold(pool)` (existing exports unchanged). It asserts (a) no active duplicate `(mentor_id, starts_at)`, (b) no `(mentor_id, mentor_local_date)` over `DAILY_CAP` active, (c) every booking row (cancelled ones too) passes `worksAt` and has `mentor_local_date === localDate(starts_at, mentor.timeZone)`. Each assertion is an `expect(offendingRows, message).toEqual([])`, so a failure shows the offending rows.

`src/server/bookings.test.ts`: the seven tests from the brief, verbatim, plus the helpers (`NOW`, `ukHours`, `usHours`, `input`, `sleep`, `seededPick`). `beforeEach` creates a test database and `afterEach` drops it. `ukHours` and `usHours` are built with a small local `hoursOn(weekdays, start, end)` helper.

`docs/red-run.txt`: the trimmed vitest failure block (see below).

## Tests

- RED, step 2: `npx vitest run src/server/bookings.test.ts` before `bookings.ts` existed.
  ```
  FAIL  src/server/bookings.test.ts [ src/server/bookings.test.ts ]
  Error: Cannot find module './bookings.ts' imported from .../src/server/bookings.test.ts
  Test Files  1 failed (1)
  ```
  Expected: the module did not exist yet.
- GREEN, focused: `npx vitest run src/server/bookings.test.ts` gave 7 passed.
- GREEN, full: `npm test` (host zones `UTC`, `Pacific/Chatham`, `America/Los_Angeles`) gave 4 files and 66 tests passed, three times. `npx tsc` reported no errors. Test output was clean, with no stderr or warnings. I ran `npm test` once before the red run and once after restoring the line, and both were green.
- RED, step 5: I deleted the `for update` line and ran `npx vitest run src/server/bookings.test.ts -t "cap race"` (exit 1):
  ```
  FAIL  src/server/bookings.test.ts > cap race: the lock makes the second booking wait, then refuse
  AssertionError: expected [ …(2) ] to have a length of 1 but got 2
  ```
  This is the expected failure. Without the lock both transactions count 1 active booking, both insert, and the day ends with 3. I saved the trimmed output to `docs/red-run.txt`: test name, assertion, Expected/Received diff, source excerpt and closing rule. I removed the `RUN v5.0.5 <repo path>` header and the `Test Files / Tests / Start at / Duration` footer. A grep for `/Users`, `v5`, `Start at`, `Duration`, `localhost` and `DATABASE` finds nothing in it.
- Restore: I put the line back from a saved copy. `cmp` shows it byte-identical to the version that was green, `grep` finds `for update` on line 88, the cap race test passes again, and the full suite is green. `git diff src/server/bookings.ts` was empty because the file was untracked until the commit, so I checked with `cmp` and `grep` instead.

## Files changed (all in commit 2fb4649)

- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/src/server/bookings.ts` (new)
- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/src/server/bookings.test.ts` (new)
- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/src/server/test-db.ts` (modified)
- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/docs/red-run.txt` (new)

The `db` container was left running. The assignment PDF remains untracked and uncommitted. No background shells were started.

## Self-review and concerns

- The brief and controller notes call the hours table `working_hours`, but the real table in `migrations/001_init.sql` is `mentor_hours`. I used `mentor_hours`.
- `getBookingWithMentor` passes the id straight to a `uuid` column. A malformed id such as `not-a-uuid` makes Postgres throw `22P02`, which would be a 500 if it reached the error middleware. The brief says nothing here, so I added no guard. Task 7 should validate the id as a uuid in the route (a 404 for a bad format) or catch it.
- `getBookingWithMentor` reads all mentors and picks one in JS. With about 10 mentors this is fine.
- `docs/red-run.txt` quotes `bookings.test.ts:84:39`. That line number shifts if the test file is edited, so refresh the file if Task 14 changes it.
- The count query in step 2 is only used for ordering. The row-locked check decides, so a stale count cannot break a rule.
- Candidate claims are tried one at a time, each in its own transaction and holding one pool client. A transaction holding a lock never asks the pool for a second client, so 80 concurrent calls on a 40-connection pool cannot deadlock. The burst test passed in all three host zones.
- `toBooking` takes `r: any`, because `pg` rows are untyped. This is the only `any`.

---

# Fix round 1

Commit `30bc1f2 fix(bookings): keep the first error, pin read committed and test candidate order`, on top of `2fb4649`. Files: `src/server/bookings.ts`, `src/server/bookings.test.ts`, `src/server/db.ts`. Lowercase, no trailer.

## Changes

1. **Rollback no longer masks the first error.** In the `catch` of `bookSlot`: `await client.query('rollback').catch(() => {}); // a dead connection cannot roll back; keep the first error`.
2. **No crash when Postgres ends a checked-out connection.** `createPool` in `src/server/db.ts` now has `pool.on('connect', (client) => client.on('error', () => {}))`, with a comment. The existing `pool.on('error')` and its `57P01` skip are unchanged.
3. **`begin isolation level read committed`.** The turnstile comment stays on the `for update` line. I did not add a second comment on the `begin` line.
4. **The `day = hour.rowCount ? null : ...` sentinel is gone.** There are now two plain checks, each `if (...) { await client.query('rollback'); continue; }`: one for the hour being taken, then one for the daily cap. The cap query only runs when the hour is free, as before.
5. **New test appended at the end of `bookings.test.ts`:** `orders candidates by active classes on that local day only`, verbatim from your message. Appending kept the `docs/red-run.txt` quote valid: line 84 is still `expect(results.filter((r) => r.ok)).toHaveLength(1);` (col 39) and lines 82-86 match the excerpt. I also tightened the `db.ts` comment, because the "same error" wording was not true when no query is in flight (see Observations).

## RED runs for the new test (temporary mutations, each restored and checked with `cmp`)

Command: `npx vitest run src/server/bookings.test.ts -t "orders candidates"`

- **Mutation 1: `cancelled_at is null` removed from the ordering count query.** FAIL.
  ```
  FAIL  src/server/bookings.test.ts > orders candidates by active classes on that local day only
  AssertionError: expected [ 1, 2 ] to deeply equal [ 1, 1 ]
  ```
  The cancelled row on mentor 1 counted, so the next booking went to mentor 2.
- **Mutation 2a: only the `and mentor_local_date = any($2)` condition removed.** FAIL, but not on the assertion: `error: bind message supplies 2 parameters, but prepared statement "" requires 1`. The second parameter becomes unused. It does not show the test catches the logic.
- **Mutation 2b: the local date ignored (the real test of the day condition).** The query selects, groups and keys by `mentor_id` only, the date filter and its parameter are removed, and the `load` and `loadOf` keys are the mentor id alone. FAIL:
  ```
  AssertionError: expected [ 2, 2 ] to deeply equal [ 1, 1 ]
  ```
  The booking on 28 Oct counted against mentor 1 on 27 Oct, so both bookings went to mentor 2.

I ran the test against the unmutated code too: it passes (8 of 8 in the file).

## Evidence for fixes 1 and 2 (scratch tests, deleted, not committed)

I killed a connection with `pg_terminate_backend` in three situations. The scratch test has one booking wait on the mentor lock, which another connection holds. Then it terminates the waiting backend and looks at what `bookSlot` throws.

| variant | result |
|---|---|
| both fixes | rejects with code `57P01`, the real error. No uncaught exception. |
| fix 1 undone (unguarded rollback) | rejects with `Connection terminated unexpectedly`, the rollback's error, so the real one is masked. |
| fix 2 undone (no `connect` listener) | the booking still rejects with `57P01`, but vitest reports an `Uncaught Exception`: in a real server this kills the process. |

## Final checks

- `npm test` (UTC, Pacific/Chatham, America/Los_Angeles): 4 files, 67 tests passed, three times, with no unhandled errors.
- `npm run typecheck`: exit 0.

## Observations

- Killing a backend while the transaction is idle (for example inside `beforeInsert`, between queries) does not give `57P01` even with both fixes. No query is in flight, so the error only arrives as an `'error'` event on the client, which the no-op listener drops. The next query then rejects with `Client has encountered a connection error and is not queryable`. This is a clean failure with no crash and no stuck client, because the pool drops the dead client on release. Surfacing `57P01` here would mean logging in the listener instead of ignoring it. I kept it a no-op as you specified.
- After a `23505` the loop continues to the next candidate. If the rollback failed, the client is dead and the pool discards it on release, so that is safe.
