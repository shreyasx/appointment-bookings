import { afterAll, beforeAll, expect, test } from 'vitest';
import { migrate } from './db.ts';
import { createTestDb, insertMentor, type TestDb } from './test-db.ts';

let db: TestDb;
beforeAll(async () => { db = await createTestDb(); });
afterAll(() => db.drop());

const insertBooking = (mentorId: number, startsAt: string, localDay: string) => db.pool.query(
  `insert into bookings (mentor_id, starts_at, mentor_local_date, parent_name, parent_email, child_name, parent_time_zone, class_link)
   values ($1, $2, $3, 'Asha Patel', 'asha@example.com', 'Rohan', 'Europe/London', 'https://classroom.example/trial/x')
   returning id, mentor_local_date`, [mentorId, startsAt, localDay]);

test('migrate is idempotent and creates the tables', async () => {
  expect(await migrate(db.pool)).toEqual([]);
  const { rows } = await db.pool.query(`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
  expect(rows.map((r) => r.table_name)).toEqual(['bookings', 'mentor_hours', 'mentors', 'schema_migrations']);
});

test('date columns come back as plain strings in any host time zone', async () => {
  const mentorId = await insertMentor(db.pool, { timeZone: 'Asia/Kolkata', hours: [] });
  const { rows } = await insertBooking(mentorId, '2026-10-27T15:00:00Z', '2026-10-27');
  expect(rows[0].mentor_local_date).toBe('2026-10-27');
});

test('a mentor can have only one active booking per hour', async () => {
  const mentorId = await insertMentor(db.pool, { timeZone: 'Asia/Kolkata', hours: [] });
  const first = await insertBooking(mentorId, '2026-10-28T15:00:00Z', '2026-10-28');
  await expect(insertBooking(mentorId, '2026-10-28T15:00:00Z', '2026-10-28')).rejects.toMatchObject({ code: '23505' });
  await db.pool.query('update bookings set cancelled_at = now() where id = $1', [first.rows[0].id]);
  await expect(insertBooking(mentorId, '2026-10-28T15:00:00Z', '2026-10-28')).resolves.toBeTruthy();
});
