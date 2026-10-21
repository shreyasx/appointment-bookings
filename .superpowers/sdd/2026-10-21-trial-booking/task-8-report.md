# Task 8 report: seed and server entry

Status: DONE. One commit on `main`: `9488be0 feat(seed): seed mentors and pre-book a full day and a full hour; add server entry` (no trailer, all lowercase).

## What I implemented

- `src/server/seed.ts`
  - `SEED_MENTORS`: the 10 mentors from the brief's table, all `Asia/Kolkata`. Emails are `firstname.lastname@mentors.example`, and the bios are one sentence with no pronouns. Hours are built by one `hoursFor(shift, offWeekday?)` helper:
    - `uk`: weekdays 1-5 `20:30-23:30`, weekdays 0 and 6 `14:30-18:30`.
    - `us`: weekdays 0, 2, 3, 4, 5, 6 `02:30-07:30`.
    - Vikram Rao drops weekday 5 and Divya Reddy drops weekday 2.
    - Each mentor object has the `{ name; email; subjects; bio; shift; hours }` shape from the brief.
  - `seed(pool, now)` returns `{ mentors, preBooked }`.
  - Mentors are upserted by email (`on conflict (email) do update`). Each mentor's hours are replaced by delete + insert. All ten mentors go in one transaction, with a rollback that keeps the first error.
  - Pre-booking runs only when `select count(*) from bookings` is 0, and every booking goes through `bookSlot`. It cycles four made-up parents (London, New York, Chicago, Los Angeles) at `parent1..4@example.com`.
    1. It books every open slot in `[now + 2d, now + 2d + 50h)`, calling `bookSlot` on each slot until it returns `SLOT_UNAVAILABLE`.
    2. It then rebuilds the slots, takes the first open slot at or after `now + 5d` whose UTC hour is 16, and books it until it's unavailable.
  - The slot lookup uses the same `now - 2d` to `now + 16d` booking margins as `/api/slots`.
  - The seed takes `now` from its caller and never reads the real time.
- `src/server/main.ts`
  - Defaults are exactly as in the brief: `DATABASE_URL`, `SMTP_URL`, `APP_URL`, `PORT`, and an optional `DEMO_NOW`.
  - Startup order: `createClock(DEMO_NOW)`, `migrate`, `seed(pool, clock.now())`, `createApp`, `listen`.
  - `webDir` is passed only when `dist/web/index.html` exists. It is resolved with `new URL('../../dist/web/', import.meta.url)` and converted with `fileURLToPath`.
  - The one-line startup log is `listening on <APP_URL>`, plus ` (demo clock from <DEMO_NOW>)` when `clock.demo`.
  - Express 5 passes a failed listen (such as a busy port) to the `listen` callback, so the callback throws that error. The process then exits non-zero instead of logging "listening".
- `package.json`: added the scripts `start` and `dev:server`.

## Tests

- Focused: `npx vitest run src/server/seed.test.ts` passes, 4 of 4.
- Typecheck: `npx tsc` reports no errors.
- Full suite: `npm test` passes in all three host zones (UTC, Pacific/Chatham, America/Los_Angeles). Each run is 7 files and 90 tests, all passing.
- Mutation check that the tests bite: I shrank the block to 5 hours and changed the "popular hour" filter to a UTC hour that doesn't exist. The "fully booked day and a full hour" test then failed and the other three still passed. I restored the file afterwards.

## TDD evidence

RED: `npx vitest run src/server/seed.test.ts`
```
 FAIL  src/server/seed.test.ts [ src/server/seed.test.ts ]
Error: Cannot find module './seed.ts' imported from .../src/server/seed.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```
This was expected, because `seed.ts` didn't exist yet.

GREEN: `npx vitest run src/server/seed.test.ts`
```
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

## Smoke test (Step 6)

I ran `npm run dev:server` as a background command, then did the following:
- `curl localhost:3000/api/slots` returned `{"now":"2026-10-20T20:56:26.999Z","demo":false,"slots":[{"startsAt":"2026-10-20T23:00:00.000Z","available":true},...`.
- I picked the first open slot from 26 Oct, `2026-10-26T15:00:00.000Z`, and posted the brief's booking for Asha Patel / Rohan / `Europe/London`. The response was **201**.
- Mailpit then held two NEW subjects, one per side:
  - `New trial class: Mon 26 Oct, 8:30 PM IST (Kolkata)`
  - `Rohan's free trial class: Mon 26 Oct, 3:00 PM GMT (London)`
  - The earlier stray message (`Tue 27 Oct, 4:00 PM GMT (London)`) was also still there, as the controller said it would be.
- `/api/mentors` returned the seeded mentors. `/` returned Express's plain 404 page, which is expected because `dist/web` doesn't exist yet, so `webDir` was not passed.
- The main `bookings` database then held 10 mentors, 63 `mentor_hours` rows and 54 bookings, which is 53 pre-booked plus the 1 smoke booking.
- I stopped the server by PID, including the `node --watch` parent, the npm wrapper and the shell wrapper. Port 3000 is free and no `main.ts` or `dev:server` processes remain. The `db` and `mailpit` containers are still running.

The background task's output file stayed empty because `rtk` buffers the wrapped command's output. So I checked the startup log line separately by running `node src/server/main.ts` directly with the output sent to a file (on ports 3101 and 3102, with the default `APP_URL`). The exact output was:
```
listening on http://localhost:3000
listening on http://localhost:3000 (demo clock from 2026-10-20T12:00:00Z)
```
The second run had `DEMO_NOW=2026-10-20T12:00:00Z`. Both processes were killed by PID afterwards.

## Files changed

- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/src/server/seed.ts` (new)
- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/src/server/seed.test.ts` (new, the brief's four tests verbatim plus imports and a `slotsNow` helper)
- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/src/server/main.ts` (new)
- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/package.json` (two scripts)

## Self-review

- **Completeness.** Each brief requirement is covered. `worksAt` is listed under "Consumes" in the brief but the seed doesn't need it, because `buildSlots` and `bookSlot` already apply the working-hours rule. I left it out rather than import it unused.
- **One clock.** `seed.ts` and `main.ts` never call `Date.now()` or `new Date()` with no argument. `createClock` is the only reader of the real time. The only `Date` methods used are `getTime` and `getUTCHours`.
- **Wording.** There is no "IST" in code, comments or bios. The `IST` in the mentor email subject comes from `Intl`, which Task 6 formats.
- **Repeat safety.** A second `seed` call rewrites the mentors and hours and books nothing. The `{ mentors: 10, preBooked: 0 }` test pins this.
- **Concerns.**
  - Two app instances starting at the exact same moment on an empty database could both pre-book. Compose runs one `app` container, so I left this alone.
  - The `app` container will run Node as PID 1, which ignores SIGTERM unless a handler is installed. That is a Dockerfile/compose concern for a later task, for example `init: true`. I didn't add a shutdown handler because the brief doesn't ask for one.
