# Trial class booking: design

Date: 2026-10-20 · Status: approved 2026-10-21

## 1. What this is and why

Codeyoung's take-home assignment: a web app where a parent books a free trial class and the system
assigns an available mentor. Parents are in the US or UK; mentors are in India. Both sides get the
class link and the time in their own local time.

The assignment is graded on product and UX, on how carefully capacity, availability, time zones, DST
and concurrency are handled, and on architecture, code quality, tests, AI usage and documentation.
The two hard parts are **concurrency** (never overbook a mentor) and **dates and times** (never show
a misleading time). Everything else stays deliberately small: "a working, understandable,
customer-friendly solution over unnecessary complexity".

### The numbers

| | |
|---|---|
| Mentors | 10, all in India today |
| Demand | about 20 parents a day |
| Cap | at most 2 trial classes per mentor per day |

10 × 2 = 20 classes a day against about 20 parents a day, so capacity equals demand. "Fully booked" is
a normal state, not a rare edge case, and the full/empty screens get real design.

### Calendar facts this design leans on

On the design date, Tue 20 Oct 2026:

- UK and Ireland clocks go back on **Sun 25 Oct 2026** at 01:00 UTC (BST → GMT, Irish IST → GMT).
- US clocks go back on **Sun 1 Nov 2026** at 2:00 AM local time, zone by zone.
- India has no DST: IST is always UTC+5:30.

A 14-day booking window opened that day spans both changes. That is why the window is 14 days and
not Codeyoung's 7.

With the real clock, both changes have left the window by 1 Nov, and the next one (US, Sun 14 Mar
2027) only enters it around 28 Feb 2027. Reviewers will likely run the app in between, so the app has
a demo clock (`DEMO_NOW`, section 7) that shows the DST behaviour live at any time.

## 2. Goals, non-goals, anti-goals

### Goals

- A parent books a trial in three short steps and always sees times in their own zone, with the zone
  abbreviation and city.
- The system assigns the mentor. A mentor is never double-booked for an hour and never has more than
  2 active classes on one day in **the mentor's own time zone**, even when many parents book at the
  same moment.
- Full days, full hours and "just taken" each have a clear, friendly state that offers the nearest
  alternatives.
- The parent and the mentor each get an email in their own time zone, sent only after the booking
  commits.
- One `docker compose up` migrates, seeds (including some pre-booked classes) and serves everything.
- Heavy, real tests on concurrency and time handling: real Postgres, fixed clocks, and tests that are
  shown to fail when the protection is removed.
- Reviewers can see the clock changes in the running app whenever they run it (demo clock).

### Non-goals (not built; say so in the README)

- Accounts, login, admin screens.
- Cancelling or rescheduling from the app. The data model has `cancelled_at`, so only active
  bookings count, but there is no cancel button or endpoint.
- Phone/OTP verification, course or grade selection, subject-based mentor matching.
- Mentor time off or holiday exceptions.
- Calendar invites (.ics), SMS, reminders.
- 30-minute start times or overlapping classes.
- "One free trial per family" limits.
- Per-reader locale formatting. Everyone gets one display style (section 7).
- Marketing content: no pitch column, trust badges, reviews or FAQ.
- Guaranteed email delivery (outbox pattern).

### Anti-goals (a failure even if it works)

- A time shown anywhere without its zone context, or a fixed UTC offset assumed for a US/UK zone.
- Overbooking under concurrency: a double-booked hour, or a third class in a mentor's day.
- Server output that depends on the host machine's time zone.
- An email for a booking that didn't commit, or a booking lost because email failed.
- Showing a booking as made before the server confirms it.
- A demo clock that isn't clearly labelled as one.
- Concurrency tests that still pass with the lock removed.
- Bloat: component libraries, ORMs, date libraries, a router library.

## 3. Constraints

- The repository is public, and the AI transcript is published with it as `TRANSCRIPT.md`. No secrets
  beyond the repo's own (the Postgres password in `docker-compose.yml` is fine).
- Submission needs `README.md` (install, configure, run, test, API docs, assumptions, architecture
  notes), `TRANSCRIPT.md`, seed data and environment-variable instructions.
- Commit messages and PR titles are entirely lowercase.
- Every container runs with `TZ=UTC`.
- Codeyoung's look: Satoshi font, accent `#FBB600` with dark text, their corner radii and sizes.

## 4. Stack and layout

- **Docker Compose**, three services plus a test service:
  - `db`: Postgres 17 (`postgres:17-alpine`), healthcheck with `pg_isready`.
  - `mailpit`: catches all email. UI at `http://localhost:8025`, SMTP on `mailpit:1025`.
  - `app`: `depends_on: db: condition: service_healthy` (and `mailpit`). On start it runs
    migrations, then the seed, then serves the API and the built React app on
    `http://localhost:3000`. One origin: no CORS, no nginx.
  - `test`: same image built with dev dependencies, under a compose profile so `up` never starts it.
    `docker compose run --rm test` runs the whole suite against the `db` service.
  - All services set `TZ=UTC`.
- **Backend**: Node 24, Express 5, TypeScript, Zod, `pg` (node-postgres) with plain SQL.
  - Express 5 forwards rejected promises from async handlers to error middleware, so there is no
    async wrapper.
  - The server runs its TypeScript directly with Node's built-in type stripping, and `tsc --noEmit`
    only typechecks. That means erasable syntax only: no `enum`, no namespaces, no parameter
    properties, and `.ts` extensions in relative imports. If type stripping misbehaves in the Docker
    image, fall back to a plain `tsc` build step. Don't reach for a third runner.
  - Migrations are numbered `.sql` files (`migrations/001_init.sql`, …) plus a ~20-line runner. The
    runner holds a Postgres advisory lock, applies files not yet recorded in `schema_migrations`
    (each in its own transaction) and records them.
- **Frontend**: React with Vite, built to static files that Express serves, with an SPA fallback for
  non-`/api` paths.
  - TanStack Query for all server data. No fetching inside `useEffect`.
  - Tailwind CSS v4 through `@tailwindcss/vite`. No component library.
  - The whole palette lives in one `@theme` block (section 10), and nothing else hard-codes a colour.
- **Email**: nodemailer to Mailpit.
- **Tests**: Vitest, plus supertest for HTTP.
- **One package** (one `package.json`) with `src/server`, `src/web` and `src/shared`.
  - `src/shared/time.ts` is imported by both server and browser, so the UI and the emails format time
    with the same code.
  - Libraries only the browser bundle needs (React, TanStack Query, Tailwind, Vite) are dev
    dependencies, because they are compiled away. The runtime image then only installs Express, `pg`,
    Zod and nodemailer.

Suggested layout (keep files few; split only when a file gets unwieldy):

```
docker-compose.yml  Dockerfile  package.json  tsconfig.json  vite.config.ts  index.html
migrations/001_init.sql
src/shared/time.ts                 + time.test.ts
src/server/main.ts                 migrate → seed → listen
src/server/app.ts                  express app factory: routes + error middleware
src/server/db.ts                   pool + migration runner
src/server/slots.ts                pure slot building          + slots.test.ts
src/server/bookings.ts             the booking transaction     + bookings.test.ts
src/server/email.ts                pure rendering + sending    + email.test.ts
src/server/seed.ts
src/server/api.test.ts             HTTP behaviour via supertest
src/web/main.tsx  App.tsx  index.css
src/web/BookingPage.tsx  ConfirmationPage.tsx  MentorsPage.tsx
src/web/hooks.ts                   useTimeZone, useSlots, useBookSlot
src/web/booking.ts                 reducer + pure helpers      + booking.test.ts
```

`createApp({ pool, clock, mailer })` takes its dependencies, so tests pass a fixed clock, a test pool
and a fake or broken mailer. In production `clock` is the real clock, or the demo clock when
`DEMO_NOW` is set (section 7).

## 5. Domain rules

- **Mentors** have an IANA time zone and weekly working hours written in their own time zone.
- **Classes** are 60 minutes and start on the hour in UTC. Classes never overlap. US and UK zones are
  whole hours from UTC, so parents see on-the-hour times; mentors in India see half-past times
  (8:30 PM IST).
- **Booking window**: a class can start at the earliest 2 hours from now and at the latest 14 days
  from now.
- **Eligible mentor** for an hour:
  - the mentor's working hours cover the whole class,
  - the mentor has no active booking at that hour,
  - and the mentor has fewer than 2 active bookings on that calendar day in the mentor's own time zone.
- **Assignment**: among eligible mentors, pick the one with the fewest active bookings that day, then
  the lowest id.
- **The daily cap** counts the calendar day in **the mentor's own time zone**. Write it that way in
  code, comments and README, never as "IST". All mentors are in India today so the result is the
  same, and it keeps working if a mentor is ever elsewhere.
  - Example (also a test): a Los Angeles parent's Mon 26 Oct, 6:00 PM PDT is Tue 27 Oct, 6:30 AM in
    Kolkata. The parent sees it under Monday, and it counts toward the mentor's Tuesday.
- **Active** booking means `cancelled_at IS NULL`. Every rule above counts only active bookings.

## 6. Concurrency

Postgres enforces both limits. The mental model is a turnstile on the mentor's row: bookings for the
same mentor take turns, and bookings for different mentors run in parallel.

```
Mentor 7 already has 1 class that day. Two parents book 15:00Z and 16:00Z at once.

T1: lock 7 → free at 15:00? yes → 1 < 2? yes → INSERT → COMMIT (lock released)
T2: lock 7 → (waits for T1) → free at 16:00? yes → 2 < 2? no → ROLLBACK → try next mentor
```

### The booking function: `bookSlot(pool, input, now, hooks?)`

1. Input is already validated (section 8). The requested time must be on the UTC hour and inside the
   booking window. If it isn't, return `SLOT_UNAVAILABLE`.
2. Work out candidate mentors in plain JavaScript: their working hours cover the class. Sort them by
   that day's active count, then by id. This pre-check only sets the order. It is not trusted.
3. For each candidate, run one short transaction at Postgres's default READ COMMITTED:
   1. `SELECT id FROM mentors WHERE id = $1 FOR UPDATE`. This is the turnstile.
   2. Free at that hour? Check for an active booking with this `mentor_id` and `starts_at`. If one
      exists: `ROLLBACK` and move to the next candidate.
   3. Under the cap? Count active bookings with this `mentor_id` and `mentor_local_date` (the class's
      date in the mentor's own time zone, computed with the shared time module). If the count is 2 or
      more: `ROLLBACK` and move to the next candidate.
   4. `await hooks?.beforeInsert?.()`, a test seam (see section 12).
   5. `INSERT` the booking, `COMMIT`, return it.
   6. A unique violation (`23505`) means the backstop fired: `ROLLBACK` and move to the next
      candidate.
4. If no candidate is left, return `SLOT_UNAVAILABLE`.

### Why it's safe, and the rules that keep it safe

- **The lock covers the check and the write.** The lock is held from `FOR UPDATE` until `COMMIT` or
  `ROLLBACK`, so no other booking for that mentor can slip between check and insert.
- **One lock per transaction.** Each candidate gets its own transaction, so a request never holds two
  mentor locks and cannot deadlock.
- **Every booking write goes through `bookSlot`**, including the seed. A path that skipped the lock
  would bypass the turnstile.
- **It depends on READ COMMITTED.** Each statement takes a fresh snapshot, so T2's count after waiting
  sees T1's committed booking. Under REPEATABLE READ, T2 would count from a snapshot taken *before* it
  waited, and the cap would silently break. Don't change the isolation level; the cap race test
  catches it if anyone does.
- **The backstop.** A partial unique index on `(mentor_id, starts_at) WHERE cancelled_at IS NULL`
  makes a double-booked hour impossible even for code that ignores the lock. The cap has no
  equivalent backstop; the lock is what enforces it, and the tests prove it.
- **Commit first, then email.** `bookSlot` never sends email. The route handler calls `bookSlot`,
  responds, and sends both emails after the commit. A failed send is logged and never fails or rolls
  back the booking. Holding the lock while talking to SMTP would make every other booking for that
  mentor wait on the mail server.
- Plain reads (the slots list, the mentors page) take no locks and are never blocked.

## 7. Time zones and DST

### Rules

1. **Instants only, in the database and on the wire.**
   - Postgres uses `timestamptz`.
   - JSON carries ISO-8601 strings ending in `Z`.
   - SQL never casts a `timestamptz` to a date or local time. Local dates are computed in the shared
     time module and stored explicitly (`mentor_local_date`).
2. **Zones are IANA names**, never offsets or abbreviations.
   - Mentors have one.
   - Each booking stores the parent's zone as chosen at booking time.
3. **In the booking rules, wall-clock time becomes an instant in exactly one place**: turning a
   mentor's weekly working hours into instants for a given date. Everything else goes from an instant
   to a local display. The one display-side exception is finding a day's local noon, which the
   clock-change notice uses.
4. **The browser groups slots into the parent's local days.** The server sends a flat list of
   instants; it doesn't know or care about the parent's day boundaries. Changing the zone regroups
   instantly, with no refetch.
5. **One display style for everyone, in the UI and in emails**, exactly as in the approved mockups:
   "Fri 23 Oct, 4:00 PM BST (London)", "9:30 PM IST (Kolkata)", "11:00 AM EST (New York)".
   - Dates use weekday, day and short month ("Tue 27 Oct"), plus the year on the confirmation page.
     Never numeric dates.
   - Times are 12-hour with uppercase AM/PM, as in Codeyoung's own picker.
   - **The abbreviation is the name people use locally.**
     - `Intl`'s short names depend on the locale: an `en-US` browser shows London summer time as
       "GMT+1". Only `en-GB` says "BST", and only `en-IN` says "IST" for India.
     - So take the first of `en-US`, `en-GB`, `en-IE`, `en-IN`, `en-CA`, `en-AU` whose short name
       isn't an offset form like `GMT+1`. If none has one, use the offset form ("GMT+9" for Tokyo).
     - Checked in Node: London BST/GMT, Dublin IST/GMT, Kolkata IST, New York EDT/EST, Phoenix MST,
       Berlin CEST/CET, St John's NDT/NST.
   - **The city always follows**, because abbreviations collide: "IST" is both Dublin's summer time
     and India's.
   - No locale is stored or sent anywhere. The browser's and Node's `Intl` follow the same rule.
6. **One clock: the app's.** Pure functions take `now` as a parameter. Only the server's clock
   (`createApp`'s `clock`) reads the real time. The browser takes "today" from the server's `now`,
   returned by `GET /api/slots` and `GET /api/mentors`, because the server filters slots with that
   same clock. A device clock that's a few minutes or hours wrong can't make the two disagree.
   - **No second clock.**
     - Browser code never reads its own clock (`new Date()`, `Date.now()`) for app logic.
     - SQL never calls `now()` in a business query. Queries take `$now` from the app clock, for
       example "upcoming bookings" on the mentors page.
     - `created_at default now()` stays, because it's an audit field and never shown.
   - **A stale `now` is accepted.**
     - The browser's `now` is a snapshot from the last response. Refetching on focus and every 60
       seconds keeps it within a minute.
     - There's no ticking clock in the browser: a minute of lag is fine for 20 parents a day.
     - Booking always re-checks against the server's live clock, so the worst a stale `now` can cause
       is a 409, never a bad booking.
   - **Midnight while the page is open.** When "today" moves on, the day list shifts by one. If the
     selected day is no longer in the list, the page falls back to the first day that has times. This
     is derived during render, not synced with an effect.
   - **No caching.** Every `/api` response sends `Cache-Control: no-store`, so a cached response can
     never replay an old `now`.
   - **The demo clock.** If `DEMO_NOW` is set to an ISO instant, the server clock starts at that
     instant at boot and keeps ticking: `offset = Date.parse(DEMO_NOW) - Date.now()`, then
     `clock = () => new Date(Date.now() + offset)`.
     - The seed uses the same clock. It's off by default.
     - While it's on, both list endpoints return `demo: true`, and the booking and mentors pages show
       a small banner such as "Demo clock: it's Tue 20 Oct 2026, 1:00 PM in London". A fake "today"
       must never mislead.
     - It restarts from `DEMO_NOW` whenever the app restarts, so demo time jumps back. Existing
       bookings stay, and the README says so.
     - Switching it on or off on an existing database needs `docker compose down -v` first, so the
       seed re-books around the new date.
7. **The host's time zone never matters.**
   - No local-time `Date` methods anywhere (`getHours`, `getDate`, `setHours`, `toLocaleString`
     without a `timeZone`, …). Only `getTime`, `toISOString`, `Date.UTC` and `Intl` with an explicit
     `timeZone`.
   - The time tests run three times, under `TZ=UTC`, `TZ=Pacific/Chatham` (UTC+12:45, with DST)
     and `TZ=America/Los_Angeles` (behind UTC, like every US parent's browser), to prove it.
8. **Validate zones by trying them, and require an IANA-style name.**
   - Try `new Intl.DateTimeFormat('en-US', { timeZone })` inside a `try`. Never check membership in
     `Intl.supportedValuesOf('timeZone')`. Node's ICU still lists India as `Asia/Calcutta`, and
     doesn't list `Asia/Kolkata` (or `UTC`) at all. Both India names must work.
   - Trying alone isn't enough, because ICU also accepts abbreviations and legacy names. It maps
     "IST" to India, so an Irish parent's "IST" would silently become India time. It maps "EST" to a
     fixed UTC−5 and "GMT" to UTC. So a zone is valid only if Intl accepts it and it is either `UTC`
     or an `Area/Location` name (it contains a `/`).

### The shared time module (`src/shared/time.ts`)

No dependencies, just `Intl`. Indicative API; the builder picks the names:

- `isValidTimeZone(tz)`
- `offsetMinutes(instant, tz)`: from `Intl` (`timeZoneName: 'longOffset'` or `formatToParts`).
- `localDate(instant, tz)`: returns `'YYYY-MM-DD'`.
- `zonedTimeToInstant(date, time, tz)`: wall-clock to instant, with the same disambiguation as
  Temporal's default (`'compatible'`):
  - **in a gap** (spring forward), move forward by the skipped hour: 2:00 becomes 3:00, and 2:30
    becomes 3:30;
  - **in a repeated hour** (fall back), use the first occurrence.
- Formatting helpers that take `(instant, tz)` and implement rule 5: the time ("4:00 PM"), the date
  ("Tue 27 Oct"), the abbreviation, the city, and the combined "Fri 23 Oct, 4:00 PM BST (London)".
  Some runtimes put a narrow no-break space (U+202F) before AM/PM, so tests normalise whitespace
  before comparing strings.
- `cityName(tz)`: the last IANA segment with `_` turned into spaces, plus a tiny alias map for cities
  ICU still calls by old names (`Asia/Calcutta` → Kolkata, `Europe/Kiev` → Kyiv, `Asia/Saigon` → Ho
  Chi Minh City).

Mark it with `// ponytail: Intl only; swap for Temporal.ZonedDateTime once Node and Safari ship it`,
and the abbreviation lookup with
`// ponytail: six English locales cover the zones we serve; add a per-zone map if one picks a wrong name`.

### Edge cases, with real 2026 output

**The same mentor hour across the autumn changes.** A mentor teaching at 8:30 PM IST every weekday:

| Mentor's 8:30 PM IST | London | New York | Phoenix |
|---|---|---|---|
| Fri 23 Oct | 4:00 PM BST | 11:00 AM EDT | 8:00 AM MST |
| Tue 27 Oct | 3:00 PM **GMT** | 11:00 AM EDT | 8:00 AM MST |
| Tue 3 Nov | 3:00 PM GMT | 10:00 AM **EST** | 8:00 AM MST |

The class never moves for the mentor. Each parent sees it shift on their own change date. For one
week (25 Oct–1 Nov), London is 4 hours ahead of New York instead of 5. Phoenix never moves, because
Arizona doesn't observe DST.

**The repeated hour (fall back).** On Sun 25 Oct in London, `00:00Z` is 1:00 AM BST and `01:00Z` is
1:00 AM GMT: two different slots with the same wall-clock label. New York does the same on Sun 1 Nov
(`05:00Z` is 1:00 AM EDT, `06:00Z` is 1:00 AM EST).
- A slot's identity is its UTC instant, never its label.
- On a day that mixes two offsets, every time on screen shows its abbreviation.
- That local day has 25 hours, and grouping by local date handles it with no special case.

**The missing hour (spring forward).** On Sun 8 Mar 2026, New York jumped from 1:59 AM EST to
3:00 AM EDT, so 2:30 AM never happened. Only a mentor in a DST zone can hit this.
- Working hours that start inside the gap move forward by the skipped hour: 2:00 becomes 3:00, and
  2:30 becomes 3:30.
- Working hours that start in a repeated hour use its first occurrence.
- A window that spans a change simply has more or fewer real hours. "1:00–3:00" on the US fall-back
  day holds three classes; "2:00–5:00" on the spring-forward day holds two.
- All mentors are in India today, so this only runs in tests, which place a mentor in New York.
- Tests pin both 2:00 → 3:00 and 2:30 → 3:30, and the README uses exactly these two examples.

**The parent's day vs the mentor's day.** A Los Angeles parent's Mon 26 Oct, 6:00 PM PDT is Tue 27
Oct, 6:30 AM IST. It shows under Monday for the parent and counts toward Tuesday for the mentor.

**Ireland.** In the tz database's main format, Irish *winter* is marked as the daylight-saving period
(a negative offset change). Many runtimes ship a compatibility version that flips it back. So code
that reads a DST flag *can* get Ireland backwards, depending on which format of the data a library
uses. This design only ever asks "what's the offset at this instant?", so Dublin comes out right
(UTC+0 in January, UTC+1 in July; "GMT"/"IST"). Dublin has its own test.

**Renamed zones.** Node's ICU reports India as `Asia/Calcutta`; the seed stores `Asia/Kolkata`. Both
must validate and format.
- Display goes through `cityName`, so both show "Kolkata".
- Comparisons between zones (for example "is the saved zone the device's zone?") compare canonical
  forms: `new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone`.

## 8. API

All JSON. Errors always look like `{ "error": { "code", "message", "fields"? } }`.

| Method & path | Returns |
|---|---|
| `GET /api/slots` | `{ now, demo, slots: [{ startsAt, available }] }` for the booking window, sorted. An hour appears if at least one mentor works it. `available` is false when every such mentor is booked then or at their cap that day. |
| `POST /api/bookings` | Body `{ startsAt, parentName, parentEmail, childName, parentTimeZone }`. `201 { booking }`, `400 VALIDATION_FAILED` with `fields`, or `409 SLOT_UNAVAILABLE`. |
| `GET /api/bookings/:id` | `{ booking }` with the mentor's name, bio, subjects and time zone, or `404 NOT_FOUND`. The id is a random UUID, so the confirmation link can't be guessed. |
| `GET /api/mentors` | `{ now, demo, mentors: [{ id, name, bio, subjects, timeZone, bookings: [{ startsAt }] }] }`. Upcoming active bookings: times only, no parent or child names. |

Validation (Zod, at the edge):
- **Names**: trimmed, 1–80 characters.
- **Email**: a valid address, at most 254 characters.
- **`startsAt`**: an ISO-8601 instant. It must be exactly on the UTC hour; otherwise the request fails
  with 400.
- **`parentTimeZone`**: must pass `isValidTimeZone`.

`409 SLOT_UNAVAILABLE` covers every well-formed request for a time that can't be booked right now:
- every eligible mentor got taken,
- the time is no longer at least 2 hours away,
- or nobody works then.

The client treats all of these the same way: refetch the slots and offer the nearest open times.

Unknown errors return `500 INTERNAL` with a generic message, and the details are logged.

## 9. Emails

Rendering is a pure function (tested); sending is a thin nodemailer call. Plain text. Sent after
commit, best-effort.

- **To the parent**:
  - Subject: e.g. "Rohan's free trial class: Tue 27 Oct, 4:00 PM GMT (London)".
  - Body: their time with zone and city, the mentor's name, the class link, a link to the confirmation
    page (`APP_URL/bookings/:id`), and one line with the mentor's own time.
- **To the mentor**:
  - Subject: e.g. "New trial class: Tue 27 Oct, 9:30 PM IST (Kolkata)".
  - Body: the time in the mentor's own time zone first, then the family's local time underneath
    ("4:00 PM GMT for the family in London"), the child's and parent's names, and the class link.
- Each side's time is formatted in that side's own zone, in the single style from section 7.
- **The class link** is `https://classroom.example/trial/<random>`. The `.example` domain is reserved,
  so the link can never point at a real site.

## 10. UI

Mockups were reviewed and approved. Single centred card on a `#FAFAFA` page, Codeyoung's look, no
marketing content. Header: a "Codeyoung" wordmark and an "Our mentors" link. When the demo clock is
on, a small banner above the card says so (section 7).

### Booking page (`/`): one card, steps 1–2 of a 3-step progress bar

**Step 1 · Your details**
- Fields: parent's name, parent's email, child's name. Visible labels above the fields, linked with
  `useId`.
- The button reads "Choose a time".
- Details come first, as on Codeyoung, so a "just taken" retry happens on the time screen and nothing
  needs retyping.

**Step 2 · Pick a time**
- A back arrow returns to step 1 with the details kept.
- **Zone pill**, showing the city:
  - It opens a native `<select>`: common zones first (Los Angeles, Denver, Phoenix, Chicago, New York,
    Anchorage, Honolulu, London, Dublin, Kolkata), then all of `Intl.supportedValuesOf('timeZone')`.
    Options are labelled "City (GMT±h)".
  - The current zone is always included, even if the list lacks it.
- **Day chips**: 14 of them, for today and the next 13 local days, each with its open-slot count.
  - A day with none says "Full".
  - Slots beyond the 14th local day are ignored, so no chip shows a half-counted day.
  - The row scrolls horizontally, with arrow buttons.
- **Clock-change notice**: when the selected day is on a different UTC offset from today, a notice
  says the clocks in that city change on that date and that times from then on are in the new
  abbreviation. On a day that itself mixes two offsets, every slot shows its abbreviation.
- **Slots**: native radios styled as buttons. Full hours stay visible but disabled, with a visible
  "Full" label and one line explaining greyed-out times. Night-time hours are shown, not filtered.
- **A fully booked day**: the empty state names the day and offers the nearest days before and after
  that still have times. Tapping one jumps there.
- **Confirm button**: repeats the exact choice, e.g. "Confirm Tue 27 Oct, 4:00 PM GMT".
- **On 409**:
  - The slots query is invalidated and refetched.
  - An alert (`role="alert"`) says the chosen time is no longer available. It offers the 3 nearest
    open times to the one attempted, taken from the fresh list.
  - The details are kept, the selection is cleared, and there's no optimistic UI.

### Confirmation page (`/bookings/:id`), step 3

- "You're booked!", the child's name, the date, and the start–end time with abbreviation and city.
- "Your mentor joins from Kolkata, where it's 9:30 PM IST", formatted in the mentor's own zone.
- A mentor card, a "Join class" button with the dummy link visible beneath it, and "We've emailed this
  to …".
- It has its own URL and fetches by id, so refresh and sharing work.

### Mentors page (`/mentors`), showcase version B

- Profile cards: initials avatar, name, "Teaches from Kolkata · IST", subject tags, and a short bio.
- **Booked trial classes**: upcoming times in the mentor's own time zone. A day at the cap is marked
  "2 of 2 that day". Times only, no names.

### React rules (decided)

- TanStack Query for everything fetched. No fetching inside `useEffect`.
- Custom hooks:
  - **`useTimeZone`** starts from the saved zone if valid, else the device zone. It saves to
    `localStorage` only when the parent changes it, with reads and writes wrapped in `try`. When the
    saved zone isn't the device zone (compared canonically), a one-line hint offers to switch.
  - **`useSlots`** wraps the slots query, with `refetchInterval: 60_000` so other families' bookings
    show up.
  - **`useBookSlot`** wraps the booking mutation. On success it navigates to the confirmation page;
    on 409 it invalidates `['slots']`.
  - Mentors and the confirmation page use `useQuery` directly.
- `useReducer` for the booking flow:
  - State: step, details, selected day, selected slot, and the time that just became unavailable.
  - The reducer is pure and tested.
- `useId` for every label/input pair.
- No `useOptimistic` for booking. No `useMemo` or `useCallback`.
- Pure helpers, all tested: group slots into local days, the 14-day cut-off, nearest open times,
  nearest open days, offset-change detection.
- **No router library.**
  - Three pages and a `location.pathname` switch, with plain `<a href>` links.
  - After booking: `location.assign('/bookings/' + id)`.
  - Express serves `index.html` for non-API paths.

### The palette: one `@theme` block (from the approved mockup)

```css
@theme {
  --font-sans: "Satoshi", ui-sans-serif, system-ui, sans-serif;
  --color-brand: #FBB600;      /* main accent: CTAs, selected chip, progress */
  --color-brand-50: #FFF8E6;   /* soft fill: slot-count strip, notices */
  --color-brand-100: #FFE9AD;  /* selected chip */
  --color-ink: #2F4F4F;        /* all text, including on yellow (5:1) */
  --color-ink-soft: #4F6B6B;   /* secondary text (5.5:1 on page) */
  --color-line: #E6E6E6;       /* card border */
  --color-field: #7F9999;      /* field, chip and slot borders (3:1) */
  --color-page: #FAFAFA;       /* page background */
  --color-full: #F1F3F3;       /* full slot / full day */
  --color-alert: #B42318;
  --color-alert-50: #FEF3F2;
  --radius-card: 24px;
  --radius-cta: 16px;
  --radius-field: 8px;
  --shadow-card: 0 6px 8px rgba(0, 0, 0, 0.02);
}
```

- **Sizes from codeyoung.com**:
  - card: 32px padding, ~440px wide;
  - card title: 24px medium;
  - fields: 16px text with 12px padding;
  - CTA: full width, 14px bold, 16px vertical padding;
  - progress bar: three 64×4px segments.
- **Satoshi** loads from Fontshare (`https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap`),
  falling back to the system font.
- **Accessibility basics**:
  - visible focus styles;
  - native radios and fieldsets for days and slots;
  - focus moves to the step heading when the step changes;
  - the contrast ratios in the comments above.
- **Phones**: the card goes full width and the chips scroll.

## 11. Data model (`migrations/001_init.sql`)

```sql
create table mentors (
  id          int generated always as identity primary key,
  name        text not null,
  email       text not null unique,
  time_zone   text not null,          -- IANA name
  bio         text not null,
  subjects    text[] not null
);

create table mentor_hours (            -- weekly working hours, in the mentor's own time zone
  mentor_id   int not null references mentors(id),
  weekday     smallint not null check (weekday between 0 and 6),  -- 0 = Sunday, like getUTCDay
  start_time  time not null,
  end_time    time not null,
  check (start_time < end_time)
);

create table bookings (
  id                 uuid primary key default gen_random_uuid(),
  mentor_id          int not null references mentors(id),
  starts_at          timestamptz not null,
  mentor_local_date  date not null,     -- starts_at's date in the mentor's own time zone
  parent_name        text not null,
  parent_email       text not null,
  child_name         text not null,
  parent_time_zone   text not null,
  class_link         text not null,
  created_at         timestamptz not null default now(),
  cancelled_at       timestamptz
);

create unique index bookings_one_per_mentor_hour
  on bookings (mentor_id, starts_at) where cancelled_at is null;
create index bookings_mentor_day
  on bookings (mentor_id, mentor_local_date) where cancelled_at is null;
```

- Working hours never cross midnight. Split such a shift into two rows.
- Slots fall on UTC hours, so working hours should start on a UTC hour. In India that means half
  past, e.g. 20:30.

## 12. Tests

All in Vitest. Tests that touch the database use a real Postgres (the compose `db`, separate test
database); no mocks for anything concurrency-related. The fixed test clock is
`2026-10-20T12:00:00Z`, so the 14-day window covers both autumn changes. The time tests run under
`TZ=UTC`, again under `TZ=Pacific/Chatham`, and again under `TZ=America/Los_Angeles`.

**`time.test.ts`**
- **Offsets** across January and July: New York (−5/−4), Phoenix (−7 both), London (0/+1), Dublin
  (0/+1), Kolkata (+5:30), Kathmandu (+5:45).
- **Gap**, New York on 8 Mar 2026: 2:00 → 3:00 EDT (`07:00Z`) and 2:30 → 3:30 EDT (`07:30Z`).
- **Gap**, London on 29 Mar 2026: 1:30 → 2:30 BST (`01:30Z`).
- **Repeated hour**, first occurrence: New York, 1 Nov 2026, 1:30 → `05:30Z`; London, 25 Oct 2026,
  1:30 → `00:30Z`.
- **Local date across the date line**: Los Angeles Mon 6:00 PM is Kolkata Tue 6:30 AM.
- **Validation**: `isValidTimeZone` accepts `Asia/Kolkata`, `Asia/Calcutta` and `UTC`, and rejects
  `IST`, `EST`, `GMT` and garbage.
- **Formatting**: the exact rule-5 strings, with whitespace normalised:
  - "Tue 27 Oct, 4:00 PM GMT (London)" and "Fri 23 Oct, 4:00 PM BST (London)";
  - "9:30 PM IST (Kolkata)", also for `Asia/Calcutta`;
  - Dublin "IST" in July and "GMT" in January;
  - Phoenix "MST" all year;
  - Tokyo falling back to "GMT+9".

**`slots.test.ts`** (pure)
- Weekly hours become UTC slots.
- The lead time and the 14-day horizon are respected.
- A booked hour is unavailable.
- A mentor at the cap loses only the other hours of *their own* day.
- The Los Angeles parent-day vs mentor-day case.
- A mentor placed in New York: 2:00–5:00 on the spring-forward day gives 2 classes, and 1:00–3:00 on
  the fall-back day gives 3.
- Grouping London's 25 Oct puts both 1:00 AM slots under that day.

**`bookings.test.ts`** (Postgres)
- **Happy path**: a mentor is assigned, `starts_at` is stored as an instant, and `mentor_local_date`
  is in the mentor's zone. Cancelled bookings don't count toward "free" or the cap.
- **Same-hour race**: N concurrent bookings for one hour. Successes equal the number of eligible
  mentors, everyone else gets `SLOT_UNAVAILABLE`, and no hour is double-booked.
- **Cap race, deterministic**: two concurrent bookings for different hours with the same mentor, who
  has one active class that day and is the only candidate. `hooks.beforeInsert` pauses 100 ms.
  - With the lock, the second request waits on the lock and is then rejected.
  - Without the lock, both pass the checks during the pause and both insert. So the test fails every
    time the lock is missing, not by luck.
  - During the build, remove the `FOR UPDATE` once and record the red run (README and transcript).
- **Random burst**: many concurrent bookings across random hours, then SQL checks:
  - no active duplicate `(mentor_id, starts_at)`;
  - no mentor-day with more than 2 active bookings;
  - every booking is inside its mentor's hours.
- **Backstop**: inserting a duplicate active row directly in SQL fails with `23505`. A cancelled
  duplicate is allowed.

**`api.test.ts`** (supertest)
- Status codes and error shapes: 201, 400 with `fields`, 409, 404.
- `GET /api/slots` hides hours less than 2 hours away and includes full hours as `available: false`.
- With the mailer pointed at a dead port, a booking still returns 201 and the failure is logged.
- Every `/api` response carries `Cache-Control: no-store`.
- **Demo clock**: built from `DEMO_NOW`, it starts at that instant and advances with real time. With
  it on, the list endpoints return `demo: true`, and both the slots and the mentors' upcoming bookings
  are computed from the demo `now`.

**`email.test.ts`**: each email leads with its recipient's own time and also shows the other side's,
with the right abbreviations across the clock changes.

**`booking.test.ts`** (web, pure)
- Grouping, the 14-day cut-off, nearest open times and days, offset-change detection.
- Picking the day to show: the selected day if it's still in the list, otherwise the first day with
  times (the midnight case).
- Reducer transitions: a 409 keeps the details, clears the selection and records the unavailable
  time.

## 13. Seed (`src/server/seed.ts`, runs on every start, safe to repeat)

- **10 mentors**:
  - `Asia/Kolkata`, Indian names, short bios, subjects (Coding, Math, Science, English).
  - Upserted by email.
  - Working hours replaced on each run.
- **Working hours**, in the mentor's own time zone, varied a little across mentors:
  - **UK-evening mentors (5)**: Mon–Fri 20:30–23:30 (3 classes; 4–6 PM BST / 3–5 PM GMT), and
    Sat–Sun 14:30–18:30 (4 classes; UK weekend late morning).
  - **US-evening mentors (5)**: Tue–Sun 02:30–07:30 (5 classes). This covers US Mon–Sat evenings:
    5–10 PM EDT, 4–9 PM EST, 2–7 PM PDT. It also puts 1:00 AM BST and 1:00 AM GMT into London's
    25 Oct.
- **Pre-booked classes**, only when the bookings table is empty, all through `bookSlot`, with made-up
  parents at `example.com` in a mix of US and UK zones. No emails. Relative to the app clock's `now`
  (the demo clock when `DEMO_NOW` is set):
  - **A fully booked day**: book every open slot in a 50-hour block starting 2 days out. Any 50-hour
    block contains at least one complete local day in every zone, so that day shows "Full" for US and
    UK parents alike.
  - **A full hour**: on a later day, book one popular hour until it's unavailable. It shows as "Full"
    among open hours.
- `docker compose down -v` resets everything.

## 14. Configuration

Environment variables, documented in the README with the compose defaults:
- `DATABASE_URL`
- `SMTP_URL` (`smtp://mailpit:1025`)
- `APP_URL` (`http://localhost:3000`), for links in emails
- `PORT` (3000)
- `TZ` (UTC)
- `DEMO_NOW`: unset by default. Set it to an ISO instant such as `2026-10-20T12:00:00Z` to start the
  demo clock. Compose passes it through from the shell (`DEMO_NOW: ${DEMO_NOW:-}`).

## 15. Documentation to produce

- **`README.md`**:
  - what it is;
  - quick start (`docker compose up`, then `localhost:3000` and Mailpit at `localhost:8025`);
  - **seeing the clock changes live**: `docker compose down -v`, then
    `DEMO_NOW=2026-10-20T12:00:00Z docker compose up`. The demo clock starts again from `DEMO_NOW`
    whenever the app restarts;
  - tests (`docker compose run --rm --build test`; `--build` because the test service sits under a profile and `up --build` never rebuilds it);
  - configuration;
  - API reference (section 8, with example requests);
  - how bookings stay correct (section 6, including READ COMMITTED);
  - time zones and DST (section 7, with the edge-case examples; the missing-hour sentence must match
    the tests);
  - assumptions and trade-offs (the non-goals);
  - project layout;
  - how to reset.
- **`TRANSCRIPT.md`**: the full AI session transcripts. The author adds it at the end; the build doesn't create it.
- This spec stays in `docs/superpowers/specs/`.

## 16. Decision log

**Decided by the user**
- Docker Compose with Postgres, Mailpit, and a database healthcheck gate. One `docker compose up`
  migrates, seeds and starts. Every container uses `TZ=UTC`.
- React + Vite served as static files; Express, TypeScript, Zod, `pg`; hand-written migrations; error
  middleware.
- A time module tested aggressively.
- React rules: TanStack Query, no fetching in effects, the three custom hooks, `useReducer`, `useId`,
  no `useOptimistic` for booking, no `useMemo`/`useCallback`.
- Tailwind with one `@theme` palette block, no component library, Codeyoung's real fonts, corners and
  sizes, accent `#FBB600` with dark text, no pitch or trust badges.
- Store UTC and convert for display; save time zones for parents and mentors; city with the
  abbreviation; group days in the browser; no date library in the browser; pass `now` as a parameter.
- The system assigns the mentor. The mentors page is a showcase, version B (profile plus booked
  classes).
- No overlapping classes; 60 minutes; a 14-day window.
- The cap counts the day in the mentor's own time zone, written that way in code and README.
- Inside the lock: free at that hour and under the cap, counting only active bookings. Email only
  after commit. The concurrency test must be able to fail.
- The missing-hour rule: move forward by the skipped hour (2:00 → 3:00, 2:30 → 3:30), with a 2:30
  test.
- The Ireland wording as in section 7.
- The seed pre-books some classes.
- A random dummy class link.
- One display style for everyone (12-hour time, weekday-day-month dates, the locally used
  abbreviation, then the city), exactly as in the mockups, with no stored locales.
- A `DEMO_NOW` demo clock: off by default, advancing from the given instant, with a visible banner.
- One clock. The browser takes "today" from the server's `now`. Neither the browser nor SQL reads a
  second clock for app logic. A stale `now` is accepted: no ticking clock in the browser, which would
  be overkill for 20 parents a day. The page falls back to a valid day at midnight. `/api` responses
  are never cached.

**Proposed and accepted in review**
- Hourly UTC grid, 2-hour lead time.
- Fewest-bookings-then-lowest-id assignment.
- `FOR UPDATE` turnstile with one transaction per candidate, plus the partial unique index backstop.
- `cancelled_at` with no cancel feature.
- The `beforeInsert` test hook with a 100 ms pause.
- Express 5, Node type stripping, one package, the shared time module.
- The API shape, the seed shape, and running the time tests under two `TZ` values.
- The approved mockups: details first; zone pill with city; 14 chips with counts; clock-change
  notice; full hours visible and disabled; nearest-days empty state; 409 alert with the nearest
  times; confirmation page with both times; `.example` class link.

**Builder calls (not yet reviewed)**
- `409 SLOT_UNAVAILABLE` is one code covering taken, too soon and not offered. The client copy is "is
  no longer available" rather than "was booked by another family", because it isn't always another
  family.
- The abbreviation lookup: six English locales in a fixed order, then the offset form.
- Day chips cover today plus the next 13 local days; slots beyond are ignored.
- The empty state offers the nearest *days*. The 409 alert offers the nearest *times*.
- `useSlots` refetches every 60 seconds.
- No router library: a full-page navigation to the confirmation page.
- Plain-text emails, plus a confirmation-page link built from `APP_URL`.
- Postgres 17, Node 24, Satoshi from Fontshare's CDN.
- Field borders darkened to `#7F9999` for 3:1 contrast, a little darker than Codeyoung's.
- The seed's exact hours, and the 50-hour fully booked block.
