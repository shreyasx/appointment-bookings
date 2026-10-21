import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { localDate } from '../shared/time.ts';
import { DAILY_CAP, isBookableTime, worksAt, type ActiveBooking, type Mentor } from './slots.ts';

export type BookingInput = {
  startsAt: Date;
  parentName: string;
  parentEmail: string;
  childName: string;
  parentTimeZone: string;
};
export type Booking = BookingInput & {
  id: string;
  mentorId: number;
  mentorLocalDate: string;
  classLink: string;
  cancelledAt: Date | null;
};
export type BookResult = { ok: true; booking: Booking } | { ok: false; code: 'SLOT_UNAVAILABLE' };

const UNAVAILABLE = { ok: false, code: 'SLOT_UNAVAILABLE' } as const;

export function newClassLink(): string {
  return `https://classroom.example/trial/${randomUUID()}`;
}

function toBooking(r: any): Booking {
  return {
    id: r.id,
    mentorId: r.mentor_id,
    startsAt: r.starts_at,
    mentorLocalDate: r.mentor_local_date,
    parentName: r.parent_name,
    parentEmail: r.parent_email,
    childName: r.child_name,
    parentTimeZone: r.parent_time_zone,
    classLink: r.class_link,
    cancelledAt: r.cancelled_at,
  };
}

/** Every mentor with their weekly hours ('HH:MM', in the mentor's own time zone), ordered by id. */
export async function loadMentors(pool: pg.Pool): Promise<Mentor[]> {
  const [mentors, hours] = await Promise.all([
    pool.query('select id, name, email, bio, subjects, time_zone from mentors order by id'),
    pool.query(
      'select mentor_id, weekday, start_time, end_time from mentor_hours order by mentor_id, weekday, start_time',
    ),
  ]);
  return mentors.rows.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    bio: m.bio,
    subjects: m.subjects,
    timeZone: m.time_zone,
    hours: hours.rows
      .filter((h) => h.mentor_id === m.id)
      .map((h) => ({
        weekday: h.weekday,
        start: h.start_time.slice(0, 5),
        end: h.end_time.slice(0, 5),
      })),
  }));
}

/** Active bookings with from <= starts_at < to. */
export async function loadActiveBookings(
  pool: pg.Pool,
  from: Date,
  to: Date,
): Promise<ActiveBooking[]> {
  const { rows } = await pool.query(
    'select mentor_id, starts_at, mentor_local_date from bookings where cancelled_at is null and starts_at >= $1 and starts_at < $2',
    [from, to],
  );
  return rows.map((r) => ({
    mentorId: r.mentor_id,
    startsAt: r.starts_at,
    mentorLocalDate: r.mentor_local_date,
  }));
}

/** Books the hour with the least-booked free mentor (lowest id on a tie), or says SLOT_UNAVAILABLE. Never sends email. */
export async function bookSlot(
  pool: pg.Pool,
  input: BookingInput,
  now: Date,
  hooks?: { beforeInsert?: () => Promise<void> },
): Promise<BookResult> {
  if (!isBookableTime(input.startsAt, now)) return UNAVAILABLE;

  const candidates = (await loadMentors(pool))
    .filter((m) => worksAt(m, input.startsAt))
    .map((mentor) => ({ mentor, date: localDate(input.startsAt, mentor.timeZone) }));
  if (candidates.length === 0) return UNAVAILABLE;

  // How loaded each candidate is that day. A stale count only affects the order; the locked check below decides.
  const { rows } = await pool.query(
    `select mentor_id, mentor_local_date, count(*)::int as n from bookings
     where cancelled_at is null and mentor_id = any($1) and mentor_local_date = any($2)
     group by mentor_id, mentor_local_date`,
    [candidates.map((c) => c.mentor.id), candidates.map((c) => c.date)],
  );
  const load = new Map<string, number>(
    rows.map((r) => [`${r.mentor_id}|${r.mentor_local_date}`, r.n]),
  );
  const loadOf = (c: (typeof candidates)[number]) => load.get(`${c.mentor.id}|${c.date}`) ?? 0;
  candidates.sort((a, b) => loadOf(a) - loadOf(b) || a.mentor.id - b.mentor.id);

  for (const { mentor, date } of candidates) {
    const client = await pool.connect();
    try {
      await client.query('begin isolation level read committed');
      await client.query('select id from mentors where id = $1 for update', [mentor.id]); // the turnstile: bookings for one mentor take turns (spec §6); relies on read committed
      const hour = await client.query(
        'select 1 from bookings where mentor_id = $1 and starts_at = $2 and cancelled_at is null',
        [mentor.id, input.startsAt],
      );
      if (hour.rowCount) {
        await client.query('rollback');
        continue;
      }
      const day = await client.query(
        'select count(*)::int as n from bookings where mentor_id = $1 and mentor_local_date = $2 and cancelled_at is null',
        [mentor.id, date],
      );
      if (day.rows[0].n >= DAILY_CAP) {
        await client.query('rollback');
        continue;
      }
      await hooks?.beforeInsert?.();
      const { rows: inserted } = await client.query(
        `insert into bookings (mentor_id, starts_at, mentor_local_date, parent_name, parent_email, child_name, parent_time_zone, class_link)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
        [
          mentor.id,
          input.startsAt,
          date,
          input.parentName,
          input.parentEmail,
          input.childName,
          input.parentTimeZone,
          newClassLink(),
        ],
      );
      await client.query('commit');
      return { ok: true, booking: toBooking(inserted[0]) };
    } catch (err) {
      await client.query('rollback').catch(() => {}); // a dead connection cannot roll back; keep the first error
      if ((err as { code?: string }).code !== '23505') throw err; // 23505: the unique index caught a clash; try the next mentor
    } finally {
      client.release();
    }
  }
  return UNAVAILABLE;
}

export async function getBookingWithMentor(
  pool: pg.Pool,
  id: string,
): Promise<{ booking: Booking; mentor: Mentor } | null> {
  const { rows } = await pool.query('select * from bookings where id = $1', [id]);
  if (!rows[0]) return null;
  const booking = toBooking(rows[0]);
  const mentor = (await loadMentors(pool)).find((m) => m.id === booking.mentorId);
  return mentor ? { booking, mentor } : null;
}
