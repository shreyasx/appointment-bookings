import { afterEach, beforeEach, expect, test } from 'vitest';
import { localDate } from '../shared/time.ts';
import { loadActiveBookings, loadMentors } from './bookings.ts';
import { seed } from './seed.ts';
import { buildSlots } from './slots.ts';
import { createTestDb, expectBookingRulesHold, type TestDb } from './test-db.ts';

let db: TestDb;
let pool: TestDb['pool'];
beforeEach(async () => {
  db = await createTestDb();
  pool = db.pool;
});
afterEach(() => db.drop());

const NOW = new Date('2026-10-20T12:00:00Z');
const DAY_MS = 24 * 3_600_000;
const slotsNow = async () =>
  buildSlots(await loadMentors(pool), await loadActiveBookings(pool, new Date(NOW.getTime() - 2 * DAY_MS), new Date(NOW.getTime() + 16 * DAY_MS)), NOW);

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
    expect([...days.values()].some((d) => d.every((s) => !s.available))).toBe(true); // a fully booked day
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
