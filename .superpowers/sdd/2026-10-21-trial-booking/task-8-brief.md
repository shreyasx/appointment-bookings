### Task 8: Seed and server entry

**Files:**
- Create: `src/server/seed.ts`, `src/server/seed.test.ts`, `src/server/main.ts`
- Modify: `package.json` (scripts `"start": "node src/server/main.ts"` and `"dev:server": "node --watch src/server/main.ts"`)

**Interfaces:**
- Consumes:
  - `bookSlot`, `loadMentors`, `loadActiveBookings` (Task 5);
  - `buildSlots`, `worksAt` (Task 4);
  - `createPool`, `migrate` (Task 3);
  - `createApp`, `createClock` (Task 7);
  - `createSmtpMailer` (Task 6).
- Produces:
  - `src/server/seed.ts`:
    - `SEED_MENTORS`, an array of `{ name; email; subjects; bio; shift: 'uk' | 'us'; hours: WorkingHours[] }`;
    - `seed(pool: Pool, now: Date): Promise<{ mentors: number; preBooked: number }>`.
  - `src/server/main.ts`: the runnable server.

- [ ] **Step 1: Write the failing tests** in `src/server/seed.test.ts`. One database per test, `NOW = new Date('2026-10-20T12:00:00Z')`, and a helper `slotsNow()` that returns `buildSlots(loadMentors, loadActiveBookings(NOW − 2d, NOW + 16d), NOW)`.

```ts
test('seeds 10 mentors and is safe to repeat', async () => {
  const first = await seed(pool, NOW);
  expect(first.mentors).toBe(10);
  expect(first.preBooked).toBeGreaterThan(0);
  const hoursBefore = (await pool.query('select count(*)::int as n from mentor_hours')).rows[0].n;
  expect(await seed(pool, NOW)).toEqual({ mentors: 10, preBooked: 0 });
  expect((await pool.query('select count(*)::int as n from mentor_hours')).rows[0].n).toBe(hoursBefore);
});

test('London, New York and Los Angeles each see a fully booked day and a full hour', async () => {
  await seed(pool, NOW);
  const slots = await slotsNow();
  for (const tz of ['Europe/London', 'America/New_York', 'America/Los_Angeles']) {
    const days = Map.groupBy(slots, (s) => localDate(s.startsAt, tz));
    expect([...days.values()].some((d) => d.every((s) => !s.available))).toBe(true);             // a fully booked day
    expect([...days.values()].some((d) => d.some((s) => s.available) && d.some((s) => !s.available))).toBe(true); // a full hour among open ones
  }
});

test("London's 25 Oct still offers 1:00 AM BST and 1:00 AM GMT", async () => {
  await seed(pool, NOW);
  const open = (await slotsNow()).filter((s) => s.available).map((s) => s.startsAt.toISOString());
  expect(open).toEqual(expect.arrayContaining(['2026-10-25T00:00:00.000Z', '2026-10-25T01:00:00.000Z']));
});

test('every pre-booked class keeps the rules', async () => {
  await seed(pool, NOW);
  await expectBookingRulesHold(pool);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/server/seed.test.ts`
Expected: FAIL, failing to resolve `./seed.ts`.

- [ ] **Step 3: Implement `src/server/seed.ts`.** All mentors are `Asia/Kolkata`. Use one-sentence bios with no pronouns. Emails are `firstname.lastname@mentors.example`.

| # | Name | Subjects | Shift |
|---|---|---|---|
| 1 | Priya Sharma | Coding, Math | uk |
| 2 | Arjun Mehta | Coding | uk |
| 3 | Ananya Iyer | Math, Science | uk |
| 4 | Kavya Nair | English | uk |
| 5 | Vikram Rao | Coding, Science | uk, no Friday |
| 6 | Sneha Kulkarni | Math | us |
| 7 | Aditya Joshi | Coding | us |
| 8 | Meera Pillai | Science | us |
| 9 | Karan Malhotra | Coding, Math | us |
| 10 | Divya Reddy | English, Math | us, no Tuesday |

  - **Hours:**
    - `uk`: weekdays 1–5 `20:30–23:30`, and weekdays 0 and 6 `14:30–18:30`.
    - `us`: weekdays 0, 2, 3, 4, 5, 6 `02:30–07:30`.
  - **Mentors**: upsert by email (`on conflict (email) do update`). Replace each mentor's hours with delete + insert inside one transaction.
  - **Pre-booking** happens only when `select count(*) from bookings` is 0. Every booking goes through `bookSlot`, cycling four made-up parents (London, New York, Chicago, Los Angeles, at `parentN@example.com`).
    1. Book every open slot in `[now + 2 days, now + 2 days + 50 hours)`, calling `bookSlot` repeatedly on each slot until it returns `SLOT_UNAVAILABLE`.
    2. Then, using fresh `buildSlots` results, take the first open slot at or after `now + 5 days` whose UTC hour is 16, and book it until it's unavailable.

- [ ] **Step 4: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times.

- [ ] **Step 5: Implement `src/server/main.ts`**
  - **Environment** (§14):
    - `DATABASE_URL` defaults to `postgres://bookings:bookings@localhost:5433/bookings`.
    - `SMTP_URL` defaults to `smtp://localhost:1025`.
    - `APP_URL` defaults to `http://localhost:3000`.
    - `PORT` defaults to `3000`.
    - `DEMO_NOW` is optional.
  - **Startup sequence:**
    1. `createClock(DEMO_NOW)`.
    2. `migrate`.
    3. `seed(pool, clock.now())`.
    4. `createApp`. Pass `webDir` only when `dist/web/index.html` exists.
    5. `listen`.
  - **Startup log**: one line, `listening on <APP_URL>`, with ` (demo clock from <DEMO_NOW>)` appended when the demo clock is on.

- [ ] **Step 6: Smoke-test the server locally**

Run: `npm run dev:server`, then in another shell `curl -s localhost:3000/api/slots | head -c 200`
Expected: JSON starting `{"now":"…","demo":false,"slots":[{"startsAt":`. Then:
1. POST a booking: `curl -s -X POST localhost:3000/api/bookings -H 'content-type: application/json' -d '{"startsAt":"<an available startsAt from /api/slots>","parentName":"Asha Patel","parentEmail":"asha@example.com","childName":"Rohan","parentTimeZone":"Europe/London"}'`. Expected: 201.
2. Run `curl -s localhost:8025/api/v1/messages | grep -o '"Subject":"[^"]*"'`. Expected: two subjects, one per side.

- [ ] **Step 7: Commit**

```bash
git add src/server/seed.ts src/server/seed.test.ts src/server/main.ts package.json
git commit -m "feat(seed): seed mentors and pre-book a full day and a full hour; add server entry"
```

---

