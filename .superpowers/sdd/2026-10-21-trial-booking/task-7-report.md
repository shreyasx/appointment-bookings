# Task 7 report: HTTP API, validation and the clock

Commit: `8ae1340 feat(api): add slots, bookings and mentors endpoints with zod validation`

## What I implemented
- `src/shared/types.ts`: the API types, exactly as in the brief.
- `src/server/app.ts`:
  - `createClock(demoNow, realNow = Date.now)`: empty or missing value gives the real clock. Otherwise it validates with `z.iso.datetime({ offset: true })`, throws `Error('DEMO_NOW must be an ISO instant')` on failure, computes the offset once and returns a ticking demo clock. It is the only code that reads the real time.
  - `createApp(deps)`: routes in the brief's order.
    1. `/api` middleware sets `Cache-Control: no-store`.
    2. `express.json()`.
    3. `GET /api/slots`: `buildSlots` over `loadMentors` and `loadActiveBookings(now - 2d, now + 16d)`.
    4. `POST /api/bookings`: Zod parse, `bookSlot(pool, input, clock.now())`, then 201 with a `BookingDto` (mentor from `getBookingWithMentor`) or 409. After the response it renders the emails and runs `Promise.allSettled` over both `mailer.send` calls (each wrapped in an async arrow, so even a synchronous throw becomes a rejection). It logs every rejection.
    5. `GET /api/bookings/:id`: `z.uuid()` first, 404 `NOT_FOUND` otherwise.
    6. `GET /api/mentors`: active bookings with `startsAt >= clock.now()`, mapped to `{ startsAt }` and sorted ascending.
    7. JSON 404 for unknown `/api` routes.
    8. With `webDir`: `express.static` and the `/{*splat}` SPA fallback (`res.sendFile('index.html', { root: webDir })`).
    9. Error middleware: `ZodError` gives 400 with `fields` keyed by `issue.path.join('.')`, `entity.parse.failed` gives 400, anything else is logged and gives 500 `INTERNAL`.
  - `app.disable('x-powered-by')`.
- `src/server/api.test.ts`: the brief's 12 tests verbatim. I added only the imports and setup (two `Asia/Kolkata` mentors with `ukHours`, `sent`, `NOW`, `clock`, `valid`, the file-wide database).
- Dependencies: `express@^5.3.0`, `zod@^4.6.7`; dev `@types/express@^5.0.6`, `supertest@^7.3.1`, `@types/supertest@^7.2.1`.

## Small choices beyond the brief
- `bookingBody.parse(req.body ?? {})`: Express 5 leaves `req.body` undefined when there is no body, and without `?? {}` the error would be a single `fields` entry with an empty key. With it, a missing body reports every field.
- Short custom messages on the checks whose Zod default text is cryptic (`'Required'`, `'No line breaks or control characters'`, `'Must start on the UTC hour'`, `'Unknown time zone'`). The schema chain is otherwise exactly the brief's.
- Error middleware has `if (res.headersSent) return next(err)`, so a failure after the 201 can never try to write a second response.
- `GET /api/mentors` uses `loadActiveBookings(pool, now, END_OF_TIME)` with `END_OF_TIME = 9999-12-31Z`. This is the "all upcoming" upper bound, without a magic number that could drop far-future demo-clock bookings.
- `fail()` and a `STATUS` map pair each error code with its status in one place.

## Tests run
- `npx vitest run src/server/api.test.ts`: 12 passed.
- `npm test` (UTC, Pacific/Chatham, America/Los_Angeles): 6 files and 83 tests passed, three times, with clean output.
- `npm run typecheck` (`tsc`): clean.

## TDD evidence
RED, before `app.ts` existed:
```
$ npx vitest run src/server/api.test.ts
 FAIL  src/server/api.test.ts [ src/server/api.test.ts ]
Error: Cannot find module './app.ts' imported from .../src/server/api.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```
This is the expected failure from the brief: the module does not exist yet.

GREEN, after implementing:
```
$ npx vitest run src/server/api.test.ts
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

Mutation checks (temporary, reverted; `app.ts` identical to the committed file afterwards) to prove the clock test bites:
- `bookSlot(..., new Date())` in POST: "the app clock drives slots, booking and the mentors list" fails.
- `new Date()` in the mentors route: the same test fails.
- `new Date()` in the slots route: "lists slots from the app clock" and the clock test both fail.

Manual check of the unreachable-until-Task-8 `webDir` wiring, with a throwaway script in the scratchpad and nothing committed:
- `/` and `/bookings/abc` return `index.html`.
- `/x.css` is served statically.
- `/api/nope` is still a JSON 404.
- A POST with no body returns 400 with all five field errors.
- No `x-powered-by` header.

## Files changed
- Created: `src/shared/types.ts`, `src/server/app.ts`, `src/server/api.test.ts`
- Modified: `package.json`, `package-lock.json`

## Self-review
- Every route takes `now` from one `clock.now()` call per request. The only `Date.now` is the default argument of `createClock`.
- There is no SQL `now()` and no local-time `Date` method in the new code.
- No unused imports (`tsc` clean). No `any`.
- The test output is pristine: the dead-port test passes a `vi.fn()` as `log`, so nothing reaches the console.

## Concerns
- Body-parser errors other than `entity.parse.failed` (for example an over-100kb body, which is a 413 upstream) fall through to 500 `INTERNAL` and are logged. That follows the brief ("anything else: 500"), and the closed error-code set has no 413. Mapping them to 400 would be a one-line change if you want it.
- The `package-lock.json` diff is large, but it is just the new dependency tree.

---

# Fix round 1

Commit: `766f64e`. Message: `fix(api): map body read errors to 400, guard post-response email and pin two behaviours`. Files: `src/server/app.ts`, `src/server/api.test.ts`.

## Changes
1. **Body-parser client errors give 400.** The error middleware no longer tests only `entity.parse.failed`. It now treats an error as a client error when `type` is a string and `status` is a number in 400-499 (body-parser's own discriminator). It answers 400 `VALIDATION_FAILED`: "The request body is not valid JSON." for `entity.parse.failed`, "The request could not be read." for the rest. These are not logged. `status` alone is not tested, so `res.sendFile` ENOENT still falls through to a logged 500 `INTERNAL`.
2. **Post-response work is guarded.** `renderEmails` and the `allSettled` send are inside one `try/catch` that sends any error to `log` ("could not prepare the booking emails"). The `headersSent` guard stays.
3. **Two pinned behaviours.**
   - New test 'the booking is answered before any email settles': the mailer's `send` never settles, a valid POST on 2026-11-02T15:00Z (a date no other test uses) must still answer 201.
   - 'the app clock drives ...' now also asserts `mentors.now` is `'2026-10-14T13:30:00.000Z'`.
4. **Names.** The regex is now `/^[^\p{Cc}\p{Zl}\p{Zp}]*$/u`, so U+2028 and U+2029 are rejected too.

Two further tests, written first:
- 'a body over the JSON limit is a 400, not a server error' (200 KB `parentName`; also asserts `log` was not called).
- 'names with line or paragraph separators are rejected' (U+2029 in `parentName` and U+2028 in `childName` give 400 with exactly those two `fields`).

## TDD evidence
RED, after adding the new tests and before touching `app.ts`:
```
$ npx vitest run src/server/api.test.ts
 × a body over the JSON limit is a 400, not a server error
   AssertionError: expected [ 500, 'INTERNAL' ] to deeply equal [ 400, 'VALIDATION_FAILED' ]
 × names with line or paragraph separators are rejected
   AssertionError: expected 201 to be 400
 Tests  2 failed | 13 passed (15)
```
Expected: an oversized body hit the old `entity.parse.failed`-only check and became a 500, and the old regex let U+2028/U+2029 through. The never-settling-mailer test and the `mentors.now` assertion passed already, as the coordinator predicted, because they pin existing behaviour.

GREEN, after the fixes:
```
$ npx vitest run src/server/api.test.ts
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

Mutation checks (temporary, reverted; `app.ts` identical to the committed one afterwards):
- Moving the 201 below the email work: 'the booking is answered before any email settles' fails (times out at 20 s). Note that this failure is slow, 20 s, because the file uses the default test timeout.
- Throwing after `renderEmails` (temporary extra test, deleted): the booking still answers 201 and `log` receives the error.
- Throwaway script against a `webDir` with no `index.html`: GET returns 500 `INTERNAL` and is logged. An unknown `Content-Encoding` returns 400 "The request could not be read." and is not logged. Bad JSON still returns 400 "The request body is not valid JSON." and is not logged.

## Verification
- `npm test` (UTC, Pacific/Chatham, America/Los_Angeles): 6 files and 86 tests passed, three times, with clean output.
- `npm run typecheck`: clean.
