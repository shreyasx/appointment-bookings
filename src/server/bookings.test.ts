import { afterEach, beforeEach, expect, test } from 'vitest';
import { bookSlot, loadActiveBookings, loadMentors, type BookingInput } from './bookings.ts';
import { buildSlots, type WorkingHours } from './slots.ts';
import { createTestDb, expectBookingRulesHold, insertMentor, type TestDb } from './test-db.ts';

let db: TestDb;
let pool: TestDb['pool'];
beforeEach(async () => {
  db = await createTestDb();
  pool = db.pool;
});
afterEach(() => db.drop());

const NOW = new Date('2026-10-20T12:00:00Z');
const hoursOn = (weekdays: number[], start: string, end: string): WorkingHours[] => weekdays.map((weekday) => ({ weekday, start, end }));
const ukHours = hoursOn([1, 2, 3, 4, 5], '20:30', '23:30');
const usHours = hoursOn([0, 2, 3, 4, 5, 6], '02:30', '07:30');
const input = (iso: string): BookingInput => ({
  startsAt: new Date(iso),
  parentName: 'Asha Patel',
  parentEmail: 'asha@example.com',
  childName: 'Rohan',
  parentTimeZone: 'Europe/London',
});
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
// a tiny linear congruential generator, so the burst is the same on every run
const seededPick = (seed: number) => {
  let state = seed;
  return <T>(list: T[]): T => list[Math.floor(((state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32) * list.length)]!;
};

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
