# Trial class booking

## What it is

A web app for booking a free trial class with Codeyoung. A parent in the US or UK picks an hour in their own time zone and enters their name, email and their child's name. The system assigns one of 10 mentors in India, shows a confirmation page, and emails both sides, each in their own time.

- Classes are 60 minutes, start on the UTC hour, and can be booked from 2 hours to 14 days ahead.
- The cap: at most 2 active trial classes per mentor per calendar day in the mentor's own time zone. "Active" means not cancelled.
- A mentor is never booked twice in the same hour or over the cap, even when requests arrive at the same moment.
- Every time on screen and in email is shown with its zone, in one style: "Tue 27 Oct, 4:00 PM GMT (London)".

There are three pages: `/` to book, `/bookings/:id` for the confirmation, and `/mentors` for the mentors with their booked times in each mentor's own time zone.

Stack: Express 5, Postgres 17, React with Vite, TanStack Query, Tailwind CSS v4, Zod 4, nodemailer and Mailpit, tested with Vitest and supertest. There is no date library: all time-zone work goes through `Intl`.

## Quick start

You need Docker with Compose.

```bash
docker compose up
```

- The app: http://localhost:3000
- Mailpit, which catches both emails: http://localhost:8025

One `up` builds the image, waits for Postgres, runs the migration, seeds 10 mentors, and serves the API and the built web app. The seed pre-books a fully booked day and a full hour, so those states show at once.

## Seeing the clock changes live

London's clocks go back on Sun 25 Oct 2026 and New York's on Sun 1 Nov 2026. To see both inside the 14-day window, run `docker compose down -v`, then `DEMO_NOW=2026-10-20T12:00:00Z docker compose up`.

The server clock starts at `DEMO_NOW` and keeps ticking, and the seed books around it. Both list endpoints return `demo: true`, and the booking and mentors pages show a banner such as "Demo clock: it's Tue 20 Oct 2026, 1:00 PM in London", so a fake "today" can't mislead.

What to look for on the booking page, with the zone set to London:

- From Sun 25 Oct onwards, a notice: "Clocks in London change on Sun 25 Oct. Times from then on are GMT, not BST."
- Sun 25 Oct offers both "1:00 AM BST" and "1:00 AM GMT", one hour apart. On that day every time shows its abbreviation.
- The same mentor hour, 8:30 PM in Kolkata, is 4:00 PM BST on Wed 21 Oct and 3:00 PM GMT from Mon 26 Oct.
- Pick 1:00 AM GMT, then switch the zone to New York: the time stays selected and shows under Sat 24 Oct as 9:00 PM EDT, with no refetch. From Sun 1 Nov the notice reads "Times from then on are EST, not EDT."

The demo clock starts again from `DEMO_NOW` whenever the app restarts, so demo time jumps back while existing bookings stay. Switching the demo clock on or off on an existing database needs `docker compose down -v` first, so the seed books around the new date.

## Tests

```bash
docker compose run --rm --build test
```

The `--build` matters: the test service sits under a profile, so `docker compose up --build` never rebuilds it.

Or run `npm test` on the host (Node 22.18 or later) with `db` up:

```bash
docker compose up -d db
npm ci
npm test
```

The suite runs under `TZ=UTC`, `TZ=Pacific/Chatham` and `TZ=America/Los_Angeles`: Chatham is ahead of UTC and Los Angeles is behind it, like every US parent's browser. A local-time getter on a UTC-midnight value passes UTC and Chatham but fails Los Angeles.

The tests use real Postgres, with a throwaway database per test file, and a fixed clock (`2026-10-20T12:00:00Z`). An in-memory mailer stands in for SMTP, except in one test that points the mailer at a closed port.

| File                          | Covers                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/shared/time.test.ts`     | offsets, the missing and repeated hours, display formats, Dublin, both spellings of India's zone, zone validation  |
| `src/server/slots.test.ts`    | the booking window, the cap on the mentor's own day, a New York mentor on both clock-change days                   |
| `src/server/bookings.test.ts` | assignment order, the same-hour race, the cap race, a burst of 80 concurrent bookings                              |
| `src/server/api.test.ts`      | validation and the error shape, 409s, `no-store`, emails sent after the response, a failing mailer, the demo clock |
| `src/server/email.test.ts`    | both emails, each in its reader's own time zone                                                                    |
| `src/server/seed.test.ts`     | the seed repeats safely and leaves a full day and a full hour for London, New York and Los Angeles                 |
| `src/server/db.test.ts`       | migrations, `date` columns in any host zone, the one-booking-per-hour index                                        |
| `src/web/booking.test.ts`     | day grouping, nearest alternatives, the clock-change notice, zone options, the booking flow reducer                |

Type checking: `npm run typecheck`. Formatting: `npm run format` (Prettier), and `npm run format:check` to check without writing.

## Configuration

Environment variables, with the values compose sets and the defaults in `src/server/main.ts` for a run outside compose:

| Variable       | In compose                                      | Outside compose                                        | Purpose                                                             |
| -------------- | ----------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `DATABASE_URL` | `postgres://bookings:bookings@db:5432/bookings` | `postgres://bookings:bookings@localhost:5433/bookings` | Postgres                                                            |
| `SMTP_URL`     | `smtp://mailpit:1025`                           | `smtp://localhost:1025`                                | outgoing mail                                                       |
| `APP_URL`      | `http://localhost:3000`                         | `http://localhost:3000`                                | links in emails                                                     |
| `PORT`         | `3000`                                          | `3000`                                                 | HTTP port                                                           |
| `TZ`           | `UTC`                                           | the host's                                             | set on every container; output never depends on it                  |
| `DEMO_NOW`     | unset                                           | unset                                                  | an ISO instant such as `2026-10-20T12:00:00Z` starts the demo clock |

Compose passes `DEMO_NOW` through from the shell (`DEMO_NOW: ${DEMO_NOW:-}`). A value that isn't an ISO instant with an offset stops the server at boot.

Every published port is bound to `127.0.0.1` (app 3000, Mailpit 8025 and 1025, Postgres 5433), because the database uses the well-known `bookings`/`bookings` credentials. `localhost` URLs work. To show the app from another machine, drop the `127.0.0.1:` prefix on the app port in `docker-compose.yml`.

To run the server on the host instead of in a container: `docker compose stop app`, then `npm ci && npm run build && npm start`.

## API reference

All JSON. Every `/api` response sends `Cache-Control: no-store`. Errors always have this shape, with `fields` only on validation errors:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Some details need fixing.",
    "fields": { "parentEmail": "Invalid email address" }
  }
}
```

| Code                | Status | When                                                                                                                                     |
| ------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `VALIDATION_FAILED` | 400    | the body fails validation, isn't JSON, is too large or can't be read                                                                     |
| `SLOT_UNAVAILABLE`  | 409    | a well-formed request for a time that can't be booked now: it is outside the booking window (2 hours to 14 days ahead) or nobody is free |
| `NOT_FOUND`         | 404    | no such booking, or no such `/api` endpoint                                                                                              |
| `INTERNAL`          | 500    | anything else; the message is generic and the details are logged                                                                         |

The examples below ran against a fresh database under `DEMO_NOW=2026-10-20T12:00:00Z`. Output is pretty-printed and trimmed where marked `…`. Booking ids and class links are random.

### `GET /api/slots`

Every hour in the booking window that at least one mentor works, sorted. `available` is false when every mentor working that hour is booked then or at their cap that day.

```bash
curl -s localhost:3000/api/slots
```

```json
{
  "now": "2026-10-20T12:06:21.295Z",
  "demo": true,
  "slots": [
    { "startsAt": "2026-10-20T15:00:00.000Z", "available": true },
    { "startsAt": "2026-10-20T16:00:00.000Z", "available": true },
    …
    { "startsAt": "2026-10-26T16:00:00.000Z", "available": false },
    …
  ]
}
```

### `POST /api/bookings`

Body: `{ startsAt, parentName, parentEmail, childName, parentTimeZone }`.

- `startsAt`: an ISO-8601 instant with an offset (`Z` or `+05:30`), exactly on the UTC hour.
- `parentName`, `childName`: trimmed, 1–80 characters, no control characters and no line or paragraph separators.
- `parentEmail`: a valid address, at most 254 characters.
- `parentTimeZone`: at most 64 characters, an IANA name that `Intl` accepts and that is `UTC` or contains a `/`.

Returns `201 { booking }`. Both emails go out after the response.

```bash
curl -s -X POST localhost:3000/api/bookings -H 'content-type: application/json' \
  -d '{"startsAt":"2026-10-27T16:00:00Z","parentName":"Sarah Thompson","parentEmail":"sarah@example.com","childName":"Ella","parentTimeZone":"Europe/London"}'
```

```json
{
  "booking": {
    "id": "9d976e75-3990-416f-aa32-b85ba58cd010",
    "startsAt": "2026-10-27T16:00:00.000Z",
    "endsAt": "2026-10-27T17:00:00.000Z",
    "childName": "Ella",
    "parentName": "Sarah Thompson",
    "parentEmail": "sarah@example.com",
    "parentTimeZone": "Europe/London",
    "classLink": "https://classroom.example/trial/dcfb4423-1c2f-4c6b-8b14-eae79e1d2c68",
    "mentor": {
      "name": "Priya Sharma",
      "bio": "…",
      "subjects": ["Coding", "Math"],
      "timeZone": "Asia/Kolkata"
    }
  }
}
```

The same body for the seeded full hour, `2026-10-26T16:00:00Z`, returns 409:

```json
{
  "error": {
    "code": "SLOT_UNAVAILABLE",
    "message": "That time is no longer available. Please pick another."
  }
}
```

A bad body returns 400 with one message per field:

```bash
curl -s -X POST localhost:3000/api/bookings -H 'content-type: application/json' \
  -d '{"startsAt":"2026-10-27T16:30:00Z","parentName":"  ","parentEmail":"not-an-email","childName":"Ella","parentTimeZone":"IST"}'
```

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Some details need fixing.",
    "fields": {
      "startsAt": "Must start on the UTC hour",
      "parentName": "Required",
      "parentEmail": "Invalid email address",
      "parentTimeZone": "Unknown time zone"
    }
  }
}
```

### `GET /api/bookings/:id`

The booking with its mentor's name, bio, subjects and time zone. The id is a random UUID, so a confirmation link can't be guessed.

```bash
curl -s localhost:3000/api/bookings/9d976e75-3990-416f-aa32-b85ba58cd010
```

```json
{
  "booking": {
    "id": "9d976e75-3990-416f-aa32-b85ba58cd010",
    "startsAt": "2026-10-27T16:00:00.000Z",
    "endsAt": "2026-10-27T17:00:00.000Z",
    …
    "mentor": { "name": "Priya Sharma", …, "timeZone": "Asia/Kolkata" }
  }
}
```

An unknown id returns 404:

```json
{ "error": { "code": "NOT_FOUND", "message": "No such booking." } }
```

### `GET /api/mentors`

Every mentor with their upcoming active bookings: times only, no parent or child names.

```bash
curl -s localhost:3000/api/mentors
```

```json
{
  "now": "2026-10-20T12:07:02.197Z",
  "demo": true,
  "mentors": [
    {
      "id": 1,
      "name": "Priya Sharma",
      "bio": "…",
      "subjects": ["Coding", "Math"],
      "timeZone": "Asia/Kolkata",
      "bookings": [
        { "startsAt": "2026-10-22T15:00:00.000Z" },
        { "startsAt": "2026-10-22T16:00:00.000Z" },
        …
      ]
    },
    …
  ]
}
```

## How bookings stay correct

Postgres enforces both limits. Think of a turnstile on the mentor's row: bookings for the same mentor take turns, and bookings for different mentors run in parallel.

```
Mentor 7 already has 1 class that day. Two parents book 15:00Z and 16:00Z at once.

T1: lock 7 → free at 15:00? yes → 1 < 2? yes → INSERT → COMMIT (lock released)
T2: lock 7 → (waits for T1) → free at 16:00? yes → 2 < 2? no → ROLLBACK → try next mentor
```

`bookSlot` in `src/server/bookings.ts`:

1. The time must be on the UTC hour and inside the booking window (2 hours to 14 days ahead), or the answer is `SLOT_UNAVAILABLE`.
2. Candidate mentors are those whose working hours cover the whole class. They are sorted by that day's active count, then by id. This pre-check only sets the order; it is not trusted.
3. For each candidate, one short transaction at `READ COMMITTED`:
   1. `select id from mentors where id = $1 for update`: the turnstile.
   2. Is the mentor free at that hour? If not, roll back and try the next candidate.
   3. Is the mentor under the cap on that day in the mentor's own time zone (`mentor_local_date`)? If not, roll back and try the next candidate.
   4. Insert the booking and commit.
   5. A unique violation (`23505`) means the backstop fired: roll back and try the next candidate.
4. If no candidate is left, the answer is `SLOT_UNAVAILABLE`.

Why it is safe:

- **The lock covers the check and the write.** It is held from `for update` until commit or rollback, so no other booking for that mentor can slip in between.
- **One lock per transaction.** Each candidate gets its own transaction, so a request never holds two mentor locks and can't deadlock.
- **It depends on READ COMMITTED.** Each statement takes a fresh snapshot, so the second transaction's count, taken after it waited, sees the first one's committed booking. Under REPEATABLE READ the count would come from a snapshot taken before the wait, and the cap would silently break. `bookSlot` sets the level explicitly, and the cap race test catches a change.
- **The backstop.** A partial unique index on `(mentor_id, starts_at) where cancelled_at is null` makes a double-booked hour impossible even for code that skips the lock. The cap has no such backstop; the lock enforces it, and the tests prove it.
- **Every booking goes through `bookSlot`**, the seed included.
- **Commit first, then email.** `bookSlot` never sends email. The route responds, then sends both emails. A failed send is logged and never fails or rolls back the booking, and no lock is held while talking to SMTP.
- Plain reads (the slots list, the mentors page) take no locks and are never blocked.

The tests that prove it, in `src/server/bookings.test.ts`:

- **Same-hour race:** 10 concurrent requests for one hour with 3 free mentors make exactly 3 bookings, one per mentor.
- **Cap race:** a mentor with 1 class that day gets two concurrent requests for different hours. A test hook pauses 100 ms inside each transaction so they overlap. Exactly one succeeds.
- **Random burst:** 80 concurrent bookings over 10 mentors, then a check that no hour is double-booked, no mentor is over the cap on any of their own days, and every booking is inside working hours with the right mentor-local date.

### How we know the race test bites

With the `for update` line deleted from `bookSlot`, `npx vitest run src/server/bookings.test.ts -t "cap race"` fails: both bookings get through and the mentor ends up with 3 classes that day. With the line back, it passes.

```
 FAIL  src/server/bookings.test.ts > cap race: the lock makes the second booking wait, then refuse
AssertionError: expected [ …(2) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/server/bookings.test.ts:107:39
    105|     bookSlot(pool, input('2026-10-27T17:00:00Z'), NOW, pause),
    106|   ]);
    107|   expect(results.filter((r) => r.ok)).toHaveLength(1);
       |                                       ^
    108|   const { rows } = await pool.query(
    109|     `select count(*)::int as n from bookings where mentor_local_date =…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

## Time zones and DST

All conversions and display formats live in one dependency-free file, `src/shared/time.ts`, used by both the server and the browser, so the UI and the emails format time identically.

- **Instants only, in the database and on the wire.** Postgres uses `timestamptz`, and JSON carries ISO-8601 strings ending in `Z`. SQL never casts a `timestamptz` to a date. The class's date in the mentor's own time zone is computed in `time.ts` and stored as `mentor_local_date`, which is what the cap counts.
- **Zones are IANA names**, never offsets or abbreviations. Each mentor has one, and each booking stores the parent's zone as chosen.
- **Wall-clock time becomes an instant in one function** in the booking rules: turning a mentor's weekly working hours into instants for a given date (`zonedTimeToInstant`). Everything else goes from an instant to a display.
- **The browser groups slots into the parent's local days.** The server sends a flat list of instants, so changing the zone regroups at once, with no refetch.
- **One display style everywhere**, in the UI and the emails: "Fri 23 Oct, 4:00 PM BST (London)", "9:30 PM IST (Kolkata)", "11:00 AM EST (New York)".
- **The abbreviation is the name people use there:** the first of `en-US`, `en-GB`, `en-IE`, `en-IN`, `en-CA`, `en-AU` that gives a name rather than an offset form. An `en-US` formatter calls London's summer time "GMT+1", and only `en-GB` says "BST". If no locale has a name, the offset form is used ("GMT+9" for Tokyo). The city always follows, because "IST" is both Dublin's summer time and India's.
- **One clock: the app's.** Only `createClock` reads the real time, and pure functions take `now`. The browser takes "today" from the `now` in each list response, so a wrong device clock can't make the page and the server disagree. SQL never calls `now()` in a business query.
- **The host's time zone never matters.** No local-time `Date` methods anywhere (`getHours`, `getDate`, `setHours`, `toLocaleString` without a `timeZone`). The three-zone test run checks it.
- **Zones are validated by trying them**, and must be `UTC` or an `Area/Location` name. Trying alone isn't enough: ICU accepts "IST" and maps it to India, and maps "EST" to a fixed UTC−5.

### Edge cases, with real 2026 output

**The same mentor hour across the autumn changes.** A mentor teaching at 8:30 PM every weekday in Kolkata:

| Mentor's 8:30 PM in Kolkata | London          | New York         | Phoenix     |
| --------------------------- | --------------- | ---------------- | ----------- |
| Fri 23 Oct                  | 4:00 PM BST     | 11:00 AM EDT     | 8:00 AM MST |
| Tue 27 Oct                  | 3:00 PM **GMT** | 11:00 AM EDT     | 8:00 AM MST |
| Tue 3 Nov                   | 3:00 PM GMT     | 10:00 AM **EST** | 8:00 AM MST |

The class never moves for the mentor. Each parent sees it shift on their own change date. For one week (25 Oct–1 Nov), London is 4 hours ahead of New York instead of 5. Phoenix never moves, because Arizona doesn't observe DST.

**The repeated hour (fall back).** On Sun 25 Oct in London, `00:00Z` is 1:00 AM BST and `01:00Z` is 1:00 AM GMT: two different slots with the same wall-clock label. New York does the same on Sun 1 Nov (`05:00Z` is 1:00 AM EDT, `06:00Z` is 1:00 AM EST).

- A slot's identity is its UTC instant, never its label.
- On a day that mixes two offsets, every time on screen shows its abbreviation.
- That local day has 25 hours, and grouping by local date handles it with no special case.
- A class that straddles the change names both zones: "1:00 AM BST–1:00 AM GMT (London)".

**The missing hour (spring forward).** On Sun 8 Mar 2026, New York jumped from 1:59 AM EST to 3:00 AM EDT, so 2:30 AM never happened. Only a mentor in a DST zone can hit this.

- Working hours that start inside the gap move forward by the skipped hour: 2:00 becomes 3:00, and 2:30 becomes 3:30.
- Working hours that start in a repeated hour use its first occurrence.
- A window that spans a change simply has more or fewer real hours. "1:00–3:00" on the US fall-back day holds three classes; "2:00–5:00" on the spring-forward day holds two.
- All mentors are in India today, so this only runs in tests, which place a mentor in New York. The tests pin both 2:00 → 3:00 and 2:30 → 3:30.

This is the same rule as Temporal's default disambiguation (`'compatible'`).

**The parent's day vs the mentor's day.** A Los Angeles parent's Mon 26 Oct, 6:00 PM PDT is Tue 27 Oct, 6:30 AM in Kolkata. It shows under Monday for the parent and counts toward Tuesday for the mentor.

**Ireland.** In the tz database's main format, Irish _winter_ is marked as the daylight-saving period (a negative offset change). Many runtimes ship a compatibility version that flips it back. So code that reads a DST flag can get Ireland backwards, depending on which format of the data a library uses. This app only ever asks "what's the offset at this instant?", so Dublin comes out right: UTC+0 in January and UTC+1 in July, shown as "GMT" and "IST". Dublin has its own test.

**Renamed zones.** Node's ICU reports India as `Asia/Calcutta`; the seed stores `Asia/Kolkata`. Both validate and both display as "Kolkata". Comparisons between zones use ICU's canonical form, so the zone picker shows exactly one Kolkata option.

## Assumptions and trade-offs

### Not built

- Accounts, login, admin screens.
- Cancelling or rescheduling from the app. The data model has `cancelled_at`, so only active bookings count, but there is no cancel button or endpoint.
- Phone or OTP verification, course or grade selection, subject-based mentor matching.
- Mentor time off or holiday exceptions.
- Calendar invites (.ics), SMS, reminders.
- 30-minute start times or overlapping classes.
- "One free trial per family" limits.
- Per-reader locale formatting. Everyone gets one display style.
- Marketing content: no pitch column, trust badges, reviews or FAQ.
- Guaranteed email delivery (an outbox). Email is best-effort, with no retries.

### Assumptions

- All 10 mentors are in India (`Asia/Kolkata`), but each mentor has their own zone and every rule uses the mentor's own time zone, so a mentor elsewhere would work. The tests place one in New York.
- Five "UK shift" mentors teach 8:30–11:30 PM on weekdays and 2:30–6:30 PM at weekends in Kolkata. Five "US shift" mentors teach 2:30–7:30 AM in Kolkata, Sunday and Tuesday to Saturday. One mentor in each shift has a day off.
- The system picks the mentor: the least booked that day in their own time zone, then the lowest id.
- Class links are placeholders (`https://classroom.example/trial/<uuid>`).

### Simplifications marked in the code (`ponytail:`)

- `src/shared/time.ts`: `Intl` only, no date library. The upgrade path is `Temporal.ZonedDateTime` once Node and Safari ship it.
- `src/shared/time.ts`: the formatter cache clears itself past 500 entries. Use an LRU if real zones ever churn.
- `src/shared/time.ts`: six English locales pick zone abbreviations. Add a per-zone map if one picks a wrong name.
- `src/web/booking.ts`: a one-entry cache for the zone-picker options, keyed by zone and UTC hour.

### Where the build goes beyond the spec

- **The suite runs under three host zones, not two** (see [Tests](#tests)).
- **The other side's time carries its date when the days differ.** The parent's "where it's …" line and the mentor's "For the family: …" line add the date whenever the two sides fall on different calendar days, which is every US evening class: "For the family: Mon 26 Oct, 5:00 PM EDT in New York". Same-day text is unchanged ("9:30 PM IST").
- **The 409 alert names the zone:** "Sorry, 1:00 AM BST on Sun 25 Oct is no longer available." The abbreviation tells the two 1:00 AMs apart on the clock-change day.
- **Body read errors are 400s.** An oversized body or an unknown `Content-Encoding` returns `400 VALIDATION_FAILED`, not 500. A malformed JSON body was already a 400.
- **Names reject line and paragraph separators** (U+2028, U+2029) as well as control characters, so they can't break an email subject.
- **The keyboard focus ring is ink with a brand halo,** not plain brand yellow. Brand yellow on white is 1.78:1, under the 3:1 that WCAG 1.4.11 asks of focus indicators.

### Known limits

- The mentors page's "2 of 2 that day" badge counts upcoming bookings only, as the API returns them. On the mentor's current day, a class that has already happened isn't counted.
- If the server fails between committing a booking and re-reading it, the client gets a 500 for a booking that exists. The window is tiny.
- One app instance is assumed. Two instances starting together on an empty database could both pre-book the seed.

## How this was built

Built with Claude Code. The full sessions are in [TRANSCRIPT.md](TRANSCRIPT.md), the design is in [the spec](docs/superpowers/specs/2026-10-20-trial-booking-design.md), and the 14-task build is in [the plan](docs/superpowers/plans/2026-10-21-trial-booking.md).

**Process:** brainstorm → spec → plan → two agents review the plan → a fresh subagent builds each task from the plan, with a reviewer after each → one whole-branch review and one fix round. The ledger of rulings and every task's brief, report and review are in [`.superpowers/sdd/2026-10-21-trial-booking/`](.superpowers/sdd/2026-10-21-trial-booking/).

**My calls** (the full list is in spec §16, "Decided by the user"):

- Docker Compose with Postgres and Mailpit, so one `docker compose up` migrates, seeds and serves.
- Express, TypeScript, Zod, React with Vite, TanStack Query and Tailwind, with no date library.
- Store UTC instants and IANA zone names, and show every time with its abbreviation and city.
- The system assigns the mentor. Classes are 60 minutes, never overlap, and open 14 days ahead.
- The cap counts the mentor's own day, and the race test must be able to fail.
- Email only after commit, and a `DEMO_NOW` demo clock so the DST behaviour shows on any day.

**Codeyoung's own trial flow, and where this differs:**

- Kept: details first, then the time, so a "just taken" retry never means retyping; 12-hour AM/PM times, as in their picker; their font, accent colour, corners and sizes.
- Changed: a 14-day window instead of their 7, so a window opened on 20 Oct 2026 spans both the UK (25 Oct) and US (1 Nov) clock changes; field borders a little darker, for 3:1 contrast; no marketing content around the form.

## Project layout

```
docker-compose.yml          the stack: db, mailpit, app, and test (under a profile)
Dockerfile                  deps, build, test and runtime stages
.dockerignore
.prettierrc.json            Prettier: single quotes, 100 columns
TRANSCRIPT.md               what the transcript files are and how to read them
TRANSCRIPT.jsonl            the full session log, copied as is
transcript/subagents/       every implementer and reviewer subagent's log
package.json                scripts; npm test runs Vitest under three host zones
tsconfig.json               compiler rules (erasable syntax only)
vite.config.ts              Vite build, dev proxy for /api, Vitest timeouts
index.html                  web entry
migrations/
  001_init.sql              mentors, mentor_hours, bookings and the partial unique index
docs/superpowers/
  specs/2026-10-20-trial-booking-design.md   the design spec
  plans/2026-10-21-trial-booking.md          the implementation plan
.superpowers/sdd/2026-10-21-trial-booking/   the build ledger, task briefs, reports and reviews
src/shared/
  time.ts                   every time-zone conversion and display format
  types.ts                  API request and response types for server and web
src/server/
  main.ts                   entry: migrate, seed, listen
  app.ts                    createClock and createApp: routes, validation, errors, static files
  bookings.ts               data access and the bookSlot transaction
  slots.ts                  pure slot rules: working hours to class starts, availability, the cap
  email.ts                  email rendering and the SMTP mailer
  seed.ts                   10 mentors, their hours, the pre-booked classes
  db.ts                     pool, date parsing and the migration runner
  test-db.ts                test helpers: a throwaway database per file, insertMentor
src/web/
  main.tsx                  React entry and the query client
  App.tsx                   header and the path switch for the three pages
  BookingPage.tsx           details, zone pill, day chips, times, 409 alternatives
  ConfirmationPage.tsx      the booked class in the parent's zone and the mentor's
  MentorsPage.tsx           mentors with booked times in each mentor's own time zone
  ui.tsx                    Card, Progress, DemoBanner and other small pieces
  booking.ts                pure browser logic: day grouping, alternatives, zone options, the flow reducer
  api.ts                    typed fetch client
  hooks.ts                  useTimeZone, useSlots, useBookSlot
  index.css                 Tailwind and the @theme tokens
```

Each `*.test.ts` sits beside the module it tests (see [Tests](#tests)).

## How to reset

```bash
docker compose down -v
docker compose up
```

`-v` drops the database volume. The seed pre-books its full day and full hour relative to the first start, and only when `bookings` is empty, so on a volume kept for a few days the full day slides into the past. Reset before a demo, and whenever you switch `DEMO_NOW` on or off.
