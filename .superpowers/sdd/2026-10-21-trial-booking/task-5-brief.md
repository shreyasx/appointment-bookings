### Task 5: Booking transaction and data access

**Files:**
- Create: `src/server/bookings.ts`, `src/server/bookings.test.ts`
- Modify: `src/server/test-db.ts` (add `expectBookingRulesHold`)

**Interfaces:**
- Consumes:
  - `Mentor`, `ActiveBooking`, `isBookableTime`, `worksAt`, `DAILY_CAP`, `buildSlots` (Task 4);
  - `localDate` (Task 1);
  - `createTestDb`, `insertMentor` (Task 3).
- Produces (`src/server/bookings.ts`):

```ts
export type BookingInput = { startsAt: Date; parentName: string; parentEmail: string; childName: string; parentTimeZone: string };
export type Booking = BookingInput & { id: string; mentorId: number; mentorLocalDate: string; classLink: string; cancelledAt: Date | null };
export type BookResult = { ok: true; booking: Booking } | { ok: false; code: 'SLOT_UNAVAILABLE' };
export function newClassLink(): string;                                              // https://classroom.example/trial/<random>
export async function loadMentors(pool: Pool): Promise<Mentor[]>;                   // with hours ('HH:MM'), ordered by id
export async function loadActiveBookings(pool: Pool, from: Date, to: Date): Promise<ActiveBooking[]>;  // from <= starts_at < to
export async function bookSlot(pool: Pool, input: BookingInput, now: Date, hooks?: { beforeInsert?: () => Promise<void> }): Promise<BookResult>;
export async function getBookingWithMentor(pool: Pool, id: string): Promise<{ booking: Booking; mentor: Mentor } | null>;
// src/server/test-db.ts (test-only)
export async function expectBookingRulesHold(pool: Pool): Promise<void>;
```

- [ ] **Step 1: Write the failing tests** in `src/server/bookings.test.ts`
  - Each test gets a fresh database: `beforeEach` runs `createTestDb`, and `afterEach` runs `drop`.
  - Shared helpers:
    - `NOW = new Date('2026-10-20T12:00:00Z')`.
    - `ukHours`: weekdays 1–5, `'20:30'–'23:30'`.
    - `usHours`: weekdays 0, 2, 3, 4, 5, 6, `'02:30'–'07:30'`.
    - `input(iso)`: a London parent, Asha Patel / Rohan.
    - `sleep(ms)`.
    - `seededPick(seed)`: a 3-line linear congruential generator returning `(list) => list[index]`.

```ts
test('assigns the least-booked mentor, then the lowest id', async () => {
  const a = await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours });
  const b = await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours });
  const first = await bookSlot(pool, input('2026-10-27T15:00:00Z'), NOW);
  const second = await bookSlot(pool, input('2026-10-27T16:00:00Z'), NOW);
  expect([first, second].map((r) => r.ok && r.booking.mentorId)).toEqual([a, b]);
});

test("stores the instant and the date in the mentor's own time zone", async () => {
  await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: [{ weekday: 2, start: '02:30', end: '03:30' }] });
  const result = await bookSlot(pool, input('2026-10-26T21:00:00Z'), NOW); // Mon 9:00 PM in London = Tue 2:30 AM in Kolkata
  expect(result).toMatchObject({ ok: true, booking: { mentorLocalDate: '2026-10-27' } });
  expect(result.ok && result.booking.classLink).toMatch(/^https:\/\/classroom\.example\/trial\/[\w-]{8,}$/);
  const { rows } = await pool.query('select starts_at, mentor_local_date from bookings');
  expect([rows[0].starts_at.toISOString(), rows[0].mentor_local_date]).toEqual(['2026-10-26T21:00:00.000Z', '2026-10-27']);
});

test('cancelled bookings free both the hour and the cap', async () => {
  await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours });
  const first = await bookSlot(pool, input('2026-10-27T15:00:00Z'), NOW);
  await bookSlot(pool, input('2026-10-27T16:00:00Z'), NOW);
  expect(await bookSlot(pool, input('2026-10-27T17:00:00Z'), NOW)).toEqual({ ok: false, code: 'SLOT_UNAVAILABLE' });
  await pool.query('update bookings set cancelled_at = now() where id = $1', [first.ok && first.booking.id]);
  expect((await bookSlot(pool, input('2026-10-27T15:00:00Z'), NOW)).ok).toBe(true);
  expect(await loadActiveBookings(pool, NOW, new Date('2026-11-04T00:00:00Z'))).toHaveLength(2);
});

test('refuses times that cannot be booked', async () => {
  await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours });
  // off the hour, too soon, beyond 14 days, nobody works on Sunday
  for (const t of ['2026-10-27T15:30:00Z', '2026-10-20T13:00:00Z', '2026-11-04T15:00:00Z', '2026-10-25T15:00:00Z'])
    expect(await bookSlot(pool, input(t), NOW)).toEqual({ ok: false, code: 'SLOT_UNAVAILABLE' });
});

test('same-hour race: exactly one booking per free mentor', async () => {
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push(await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours }));
  const results = await Promise.all(Array.from({ length: 10 }, () => bookSlot(pool, input('2026-10-27T16:00:00Z'), NOW)));
  const booked = results.flatMap((r) => (r.ok ? [r.booking.mentorId] : []));
  expect(booked).toHaveLength(3);
  expect(new Set(booked)).toEqual(new Set(ids));
  expect(results.filter((r) => !r.ok)).toHaveLength(7);
});

test('cap race: the lock makes the second booking wait, then refuse', async () => {
  await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours });
  await bookSlot(pool, input('2026-10-27T15:00:00Z'), NOW);
  const pause = { beforeInsert: () => sleep(100) };
  const results = await Promise.all([
    bookSlot(pool, input('2026-10-27T16:00:00Z'), NOW, pause),
    bookSlot(pool, input('2026-10-27T17:00:00Z'), NOW, pause),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  const { rows } = await pool.query(`select count(*)::int as n from bookings where mentor_local_date = '2026-10-27' and cancelled_at is null`);
  expect(rows[0].n).toBe(2);
});

test('a random burst keeps every rule', async () => {
  for (let i = 0; i < 5; i++) await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours });
  for (let i = 0; i < 5; i++) await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: usHours });
  const mentors = await loadMentors(pool);
  const open = buildSlots(mentors, [], NOW).map((s) => s.startsAt.toISOString());
  const pick = seededPick(42);
  const results = await Promise.all(Array.from({ length: 80 }, () => bookSlot(pool, input(pick(open)), NOW)));
  expect(results.some((r) => r.ok)).toBe(true);
  await expectBookingRulesHold(pool);
});
```

  Add `expectBookingRulesHold(pool: Pool): Promise<void>` to `src/server/test-db.ts`. Task 8 reuses it. It asserts three things:
  - no active duplicate `(mentor_id, starts_at)`: `group by … having count(*) > 1` returns no rows;
  - no `(mentor_id, mentor_local_date)` with more than 2 active bookings;
  - every booking passes `worksAt(mentor, starts_at)`, and its `mentor_local_date` equals `localDate(starts_at, mentor.timeZone)`. Mentors come from `loadMentors`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/server/bookings.test.ts`
Expected: FAIL, failing to resolve `./bookings.ts`.

- [ ] **Step 3: Implement `src/server/bookings.ts`**
  - **`bookSlot`** follows spec §6 exactly:
    1. If `!isBookableTime(startsAt, now)`, return `SLOT_UNAVAILABLE`.
    2. Candidates are `loadMentors` filtered by `worksAt`. Sort them by active count on `localDate(startsAt, mentor.timeZone)`, then by id. Get the counts with one `group by mentor_id, mentor_local_date` query.
    3. For each candidate, check out one client and run `BEGIN` (default READ COMMITTED):
       1. `SELECT id FROM mentors WHERE id = $1 FOR UPDATE`.
       2. Look for an active booking at `(mentor_id, starts_at)`. If one exists, `ROLLBACK` and try the next candidate.
       3. Count active bookings on `(mentor_id, mentor_local_date)`. If the count is at least `DAILY_CAP`, `ROLLBACK` and try the next candidate.
       4. `await hooks?.beforeInsert?.()`.
       5. `INSERT … RETURNING *`, then `COMMIT`.
       6. On error code `23505`, `ROLLBACK` and try the next candidate. Re-throw any other error after `ROLLBACK`.
       7. Release the client in `finally`.
    4. If no candidate succeeded, return `SLOT_UNAVAILABLE`.
  - It never sends email. Comment the `FOR UPDATE` line: `// the turnstile: bookings for one mentor take turns (spec §6); relies on read committed`.
  - **Mapping and loading:**
    - `loadMentors` trims `time` values to `'HH:MM'`.
    - Rows map to camelCase.
    - `newClassLink` is `https://classroom.example/trial/${randomUUID()}`.

- [ ] **Step 4: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times.

- [ ] **Step 5: Prove the cap race test can fail.**
  1. Temporarily delete the `FOR UPDATE` statement and run `npx vitest run src/server/bookings.test.ts -t "cap race"`.
     Expected: FAIL, `AssertionError: expected [ …(2) ] to have a length of 1 but got 2`.
  2. Save that failing output in `docs/red-run.txt`. The README quotes it in Task 14.
  3. Restore the line and re-run.
     Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/bookings.ts src/server/bookings.test.ts src/server/test-db.ts docs/red-run.txt
git commit -m "feat(bookings): book with a per-mentor row lock and prove the race test bites"
```

---

