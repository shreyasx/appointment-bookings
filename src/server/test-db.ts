import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { expect } from 'vitest';
import { localDate } from '../shared/time.ts';
import { loadMentors } from './bookings.ts';
import { createPool, migrate } from './db.ts';
import { DAILY_CAP, worksAt } from './slots.ts';

export type TestDb = { pool: pg.Pool; drop(): Promise<void> };

const hex = () => randomBytes(6).toString('hex');

// A throwaway, fully migrated database, so every test file runs against its own data.
export async function createTestDb(): Promise<TestDb> {
  const adminUrl = process.env.DATABASE_URL ?? 'postgres://bookings:bookings@localhost:5433/bookings';
  const name = `t_${hex()}`;
  const admin = createPool(adminUrl, 1);
  await admin.query(`create database "${name}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = createPool(url.toString(), 40); // 40 connections for the race tests
  const drop = async () => {
    await pool.end();
    await admin.query(`drop database "${name}" with (force)`);
    await admin.end();
  };
  try {
    await migrate(pool);
  } catch (err) {
    await drop();
    throw err;
  }
  return { pool, drop };
}

export async function insertMentor(
  pool: pg.Pool,
  m: { name?: string; timeZone: string; hours: { weekday: number; start: string; end: string }[] },
): Promise<number> {
  const { rows } = await pool.query(
    `insert into mentors (name, email, time_zone, bio, subjects) values ($1, $2, $3, 'Test mentor', '{Coding}') returning id`,
    [m.name ?? 'Test Mentor', `m-${hex()}@mentors.example`, m.timeZone],
  );
  const id: number = rows[0].id;
  for (const h of m.hours) {
    await pool.query('insert into mentor_hours (mentor_id, weekday, start_time, end_time) values ($1, $2, $3, $4)', [
      id,
      h.weekday,
      h.start,
      h.end,
    ]);
  }
  return id;
}

// The three promises the database must keep, however the requests interleaved. Tests call this after a burst.
export async function expectBookingRulesHold(pool: pg.Pool): Promise<void> {
  const doubled = await pool.query('select mentor_id, starts_at from bookings where cancelled_at is null group by mentor_id, starts_at having count(*) > 1');
  expect(doubled.rows, 'a mentor booked twice in one hour').toEqual([]);
  const over = await pool.query(
    'select mentor_id, mentor_local_date from bookings where cancelled_at is null group by mentor_id, mentor_local_date having count(*) > $1',
    [DAILY_CAP],
  );
  expect(over.rows, `a mentor over ${DAILY_CAP} classes in one of their own days`).toEqual([]);
  const mentors = new Map((await loadMentors(pool)).map((m) => [m.id, m]));
  const { rows } = await pool.query('select id, mentor_id, starts_at, mentor_local_date from bookings');
  const wrong = rows.filter((r) => {
    const mentor = mentors.get(r.mentor_id)!;
    return !worksAt(mentor, r.starts_at) || r.mentor_local_date !== localDate(r.starts_at, mentor.timeZone);
  });
  expect(wrong, 'a booking outside working hours or with the wrong mentor-local date').toEqual([]);
}
