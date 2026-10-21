# Plan review A: correctness against the spec

Plan: `docs/superpowers/plans/2026-10-21-trial-booking.md` · Spec: `docs/superpowers/specs/2026-10-20-trial-booking-design.md`

Counts: **Critical 0 · Important 3 · Minor 8**

What holds up: the `zonedTimeToInstant` algorithm, every expected time/DST value in Tasks 1, 2, 4 and 9, the slot arithmetic, the seed arithmetic, the schema (§11 verbatim), the lock / READ COMMITTED / backstop design, and the red run. The cross-task interfaces line up (Tasks 1→4→5→7→8, 7→9→10→11/12). The three Important findings are all tests that pass whether or not the rule they name holds.

---

## Critical

None.

---

## Important

### I1. The API tests cannot catch a route that reads its own clock (spec §12 demo-clock bullet, §7 rule 6)

- **Plan lines:** 862 (`NOW = 2026-10-20T12:00:00Z`, fixed clock), 911–916, 918–924, 940–944.
- **What's wrong:** the fixed test clock is one day before the real build date (today is 2026-10-21). Say `GET /api/slots`, `GET /api/mentors` or `POST /api/bookings` passes `new Date()` instead of `clock.now()` to `buildSlots`, `bookSlot` or the upcoming filter. Every assertion still passes:
  - `slots[0].startsAt >= '2026-10-20T14:00Z'` is true for any later window;
  - `2026-10-28T15:00Z` is still inside a real-clock window;
  - bookings on 27–30 Oct are still "upcoming";
  - `2026-10-20T13:00Z` is refused by the real clock too.

  The demo test (940–944) checks only `demo: true`. Spec §12 asks for more: "both the slots and the mentors' upcoming bookings are computed from the demo `now`". Nothing tests that.
- **Concrete failure:** a second clock (an anti-goal, and a "decided by the user" rule) ships green. Worse, the suite turns red on its own from about 28 Oct 2026, which is when reviewers run it, with no code change.
- **Fix:** replace the test at 940–944 with a clock set *before* any possible real run, so a stray `new Date()` fails forever:

```ts
test('the app clock drives slots, booking and the mentors list', async () => {
  // before any real run, so a route that reads new Date() fails here
  const demo = createApp({ pool, clock: { now: () => new Date('2026-10-14T13:30:00Z'), demo: true }, mailer, appUrl: '' });
  const slots = (await request(demo).get('/api/slots')).body;
  expect([slots.now, slots.demo, slots.slots[0].startsAt])
    .toEqual(['2026-10-14T13:30:00.000Z', true, '2026-10-14T16:00:00.000Z']); // 15:00Z is under 2 hours away
  expect((await request(demo).post('/api/bookings').send({ ...valid, startsAt: '2026-10-15T15:00:00Z' })).status).toBe(201);
  const mentors = (await request(demo).get('/api/mentors')).body;
  expect(mentors.demo).toBe(true);
  expect(mentors.mentors.flatMap((m: MentorDto) => m.bookings.map((b) => b.startsAt))).toContain('2026-10-15T15:00:00.000Z');
});
```

  (14 Oct is a Wednesday, so `ukHours` gives 15/16/17Z. This one test also covers the §12 bullet "hides hours less than 2 hours away" at the API level, which 911–916 doesn't prove: those mentors never work 12Z or 13Z.)

### I2. The two host-zone runs cannot catch the local-getter bugs that hit every US browser (spec §7 rule 7, §12)

- **Plan lines:** 119 (`TZ=UTC … && TZ=Pacific/Chatham …`), 32–33, and every "PASS twice" step.
- **What's wrong:** both zones are at or ahead of UTC (Chatham is +12:45/+13:45). Code that reads *local* fields from a UTC-midnight value keeps the same calendar day in both runs, so it passes. Examples: `new Date('2026-10-25').getDay()` in `weekdayOf`, or `setDate(getDate() + n)` in `addDays`. `src/shared/time.ts` and `src/web/booking.ts` run in the parent's browser, and US parents are all behind UTC. `groupIntoDays` builds its 14 day keys from `addDays`.
- **Concrete failure, verified:** a local-getter `addDays` and `weekdayOf` passed the plan's own assertions under `TZ=UTC` and `TZ=Pacific/Chatham`. Under `America/Los_Angeles` and `America/New_York` they failed, with `addDays('2026-10-20', 1)` returning `'2026-10-20'`. Every US parent's day chips would be shifted or duplicated, and the suite would be green.
- **Fix:** add a third run, behind UTC, for the pure suites. It's cheap because the database suites are skipped. Then say "three times" wherever the plan says "PASS twice", and note in the README that this extends spec §12's two runs:

```json
"test": "TZ=UTC vitest run && TZ=Pacific/Chatham vitest run && TZ=America/Los_Angeles vitest run src/shared src/web src/server/slots.test.ts src/server/email.test.ts"
```

### I3. No test tells "the mentor's own day" apart from the UTC day (spec §5 cap rule, §12)

- **Plan lines:** 505–512 (slots LA case), 553, 615–622 (bookings "stores … the date in the mentor's own time zone").
- **What's wrong:** each test instant falls on the same date in UTC and in Kolkata:
  - 15–17Z;
  - `2026-10-27T01:00Z` (Kolkata Tue 06:30, and Tue in UTC too).

  So a `buildSlots` that keys the cap by `startsAt.toISOString().slice(0, 10)` passes all of Task 4. The bookings test at 615–622 also passes if `bookSlot` stores the UTC date, or the *parent's* date: `input()` is a London parent, and 27 Oct 01:00 GMT is still the 27th. The LA comment there is misleading, because no LA zone is involved. The burst and seed `expectBookingRulesHold` catch a wrong stored date only indirectly, and nothing catches a wrong `buildSlots` lookup.
- **Concrete failure, verified:** a UTC-day variant of `buildSlots` passed every Task 4 test. That bug hits every US-evening mentor: their Kolkata day runs 21:00Z–02:00Z, across two UTC dates. The slots list would then show hours as open that `bookSlot` refuses with 409, or hours as full that are actually bookable.
- **Fix:**
  1. Add to `slots.test.ts`:

```ts
test("the cap uses the mentor's own day, not the UTC day", () => {
  // Tue 27 Oct 02:30-07:30 in Kolkata is Mon 26 Oct 21:00Z to Tue 27 Oct 02:00Z
  const m = mentor(1, 'Asia/Kolkata', hours([2], '02:30', '07:30'));
  const slots = buildSlots([m], [booking(1, '2026-10-26T21:00:00Z', '2026-10-27'), booking(1, '2026-10-26T22:00:00Z', '2026-10-27')], NOW);
  expect(slotAt(slots, '2026-10-26T23:00:00.000Z')?.available).toBe(false); // UTC says Monday; the mentor's Tuesday is full
});
```

  2. In the bookings test at 615–622, use hours `{ weekday: 2, start: '02:30', end: '03:30' }` and `input('2026-10-26T21:00:00Z')`, with the comment `// Mon 9:00 PM in London = Tue 2:30 AM in Kolkata`. Expect `mentorLocalDate: '2026-10-27'`, and `['2026-10-26T21:00:00.000Z', '2026-10-27']` from SQL. Then the UTC date and the parent's date are both `2026-10-26`, so either bug fails.

  Keep the LA example from the spec in `time.test.ts` as the illustration.

---

## Minor

- **M1. Plan 63, 1400: the double-click guard leaves a gap.** Disabling only while `book.isPending` re-enables the button between success and page unload: `location.assign` is called, then the status flips to `success`. A second click during that navigation round trip books a second mentor at the same hour and sends 4 emails, which is exactly Review Focus 1. Fix: "Disabled while `book.isPending || book.isSuccess`, label 'Booking…'".
- **M2. Plan 964, 954: `createClock` accepts more than ISO instants.** `Date.parse` takes `'2026-10-20T12:00:00'` (no offset, read in the *host* zone) and `'Oct 20 2026'`. That breaks §7 rule 7 for `npm run dev:server` on a laptop outside UTC. Fix: accept only `z.iso.datetime({ offset: true }).safeParse(demoNow).success`, and add `expect(() => createClock('2026-10-20T12:00:00')).toThrow(/DEMO_NOW/)`.
- **M3. Plan 932–938 vs spec §12 line 637: the failing-mailer test uses a fake.** The spec wants the mailer pointed at a dead port. The fake proves the route, but `createSmtpMailer` is then never run by any automated test. Fix: `mailer: createSmtpMailer('smtp://127.0.0.1:9')` (connection refused rejects quickly).
- **M4. Plan 589, 624–631, 973: cancelled rows are untested on the read path.** The "active only" filter in `loadActiveBookings` has no test, so a missing `cancelled_at is null` would show cancelled hours as full in `/api/slots`. Fix: at the end of the cancel test, add `expect(await loadActiveBookings(pool, NOW, new Date('2026-11-04T00:00:00Z'))).toHaveLength(2)`.
- **M5. Plan 979, 1451, 1471 vs spec §10 "2 of 2 that day": the cap badge can undercount.** `/api/mentors` returns only `startsAt ≥ now`. On the mentor's current day, a class already past isn't counted, so a day at the cap can show without the badge. Fix: either return the bookings from the start of the mentor's current local day (`mentor_local_date >= localDate(now, tz)`) and only *style* past ones, or document that the badge counts upcoming classes.
- **M6. Plan 792, 802, 1334: the other side's time loses its date.** "For the family: {time} {abbr} in {city}" and "where it's {time} {abbr}" drop the date. For every US-evening class the two sides are on different calendar days. "When: Tue 27 Oct, 2:30–3:30 AM IST" over "For the family: 5:00 PM EDT in New York" reads as Tuesday 5 PM, but it is Monday. Also, spec §9 phrases the family line as "4:00 PM GMT for the family in London". Fix: add `formatDate` to the cross-side line when `localDate` differs, and add that case to the email test. Also have the email test check the *other* side's abbreviation across a change (spec §12 line 643), for example 23 Oct: `'For the family: 4:00 PM BST in London'`.
- **M7. Plan 518: wrong comment.** "starts 3:30 EDT" is wrong: the *window* starts at 3:30 EDT, and the first UTC-hour class is 4:00 EDT (08:00Z). The README must quote these examples exactly (spec §7), so fix the comment: `// window starts 3:30 EDT; first class 4:00 EDT`.
- **M8. Plan 1329, 1472: old TanStack call style.** `useQuery(['booking', id])` and `useQuery(['mentors'], getMentors)` are the v4 positional form. v5 needs `useQuery({ queryKey, queryFn })`, so write it that way to avoid a typecheck detour.

---

## Verification run

All scripts were throwaway, in `/private/tmp/claude-501/-Users-shreyasjamkhandi-Documents-dev-appointment-bookings/519e5da9-d7ac-4b08-8991-1d9fe9ce5f48/scratchpad/review-a/`.

1. **Time module, written exactly as the plan describes** (Task 1 algorithm and Task 2 rules). Every Task 1–2 expected value passes, plus the transition boundaries (NY 01:59/03:00 on 8 Mar, 01:00/02:00 on 1 Nov; London 01:00/02:00 on 29 Mar and 25 Oct).
   - Environments: Node 22.23.1 locally, and Node 24.22.0 in `node:24-alpine`, each under `TZ=UTC` and `TZ=Pacific/Chatham`.
   - `node:24-alpine` has no `/usr/share/zoneinfo`, but ICU still honours `TZ=Pacific/Chatham` (host offset −825 min). So the Docker Chatham run is real.
   - On Node 22 and 24, `canonicalTimeZone('Asia/Kolkata')` and `('Asia/Calcutta')` both give `Asia/Calcutta`, and `supportedValuesOf` lacks `Asia/Kolkata` and `UTC`. The spec's claims are correct.
2. **Slots module, written exactly as the plan describes.** Every Task 4 expectation passes under both zones, including the spring-forward 2 classes / fall-back 3 classes and both of London's 1:00 AM slots.
3. **Seed simulated in memory** (the plan's `bookSlot` rules and Task 8 steps):
   - With `DEMO_NOW` 2026-10-20T12:00Z: 53 bookings, the full hour at 2026-10-26T16:00Z, and both London 25 Oct 1:00 AM slots still open.
   - Swept the real-clock `now` through all of 2026, every 5 h 11 min. London, New York, Los Angeles, Chicago and Honolulu each always got a fully booked local day and a full hour among open hours on the same local day: **0 misses**.
4. **Postgres 17 (throwaway container, removed), cap race replayed in two psql sessions:**

   | Variant | Result |
   |---|---|
   | READ COMMITTED + `FOR UPDATE` | second refused after count 2 (2 active) |
   | REPEATABLE READ + `FOR UPDATE` | both inserted (3 active); confirms the spec's warning |
   | no lock | both inserted (3 active) |

   So the plan's red run is reliable: with the 100 ms pause, the second check always runs before the first commit. Six concurrent `CREATE DATABASE` also succeeded, so parallel per-file test databases are fine.
5. **UTC-day cap bug** (I3): passed every Task 4 test; the proposed case returns `true` with the bug and `false` with the correct code.
6. **Local-getter `addDays`/`weekdayOf`** (I2): passed the plan's assertions under UTC and Chatham, failed under Los Angeles and New York.
