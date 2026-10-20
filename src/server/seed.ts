import type pg from 'pg';
import { bookSlot, loadActiveBookings, loadMentors } from './bookings.ts';
import { buildSlots, type WorkingHours } from './slots.ts';

type Shift = 'uk' | 'us';
export type SeedMentor = { name: string; email: string; subjects: string[]; bio: string; shift: Shift; hours: WorkingHours[] };

const MENTOR_TIME_ZONE = 'Asia/Kolkata';
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// Working hours are in the mentor's own time zone. The "uk" shift teaches the UK evening and weekend, the "us" shift the US evening.
function hoursFor(shift: Shift, offWeekday?: number): WorkingHours[] {
  const hours =
    shift === 'uk'
      ? [...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '20:30', end: '23:30' })), ...[0, 6].map((weekday) => ({ weekday, start: '14:30', end: '18:30' }))]
      : [0, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '02:30', end: '07:30' }));
  return hours.filter((h) => h.weekday !== offWeekday);
}

const mentor = (name: string, subjects: string[], bio: string, shift: Shift, offWeekday?: number): SeedMentor => ({
  name,
  email: `${name.toLowerCase().replace(' ', '.')}@mentors.example`,
  subjects,
  bio,
  shift,
  hours: hoursFor(shift, offWeekday),
});

export const SEED_MENTORS: SeedMentor[] = [
  mentor('Priya Sharma', ['Coding', 'Math'], 'Turns first lines of code and tricky fractions into small wins that make a child want to try the next one.', 'uk'),
  mentor('Arjun Mehta', ['Coding'], 'Teaches coding through games and animations, so every lesson ends with something a child can show off.', 'uk'),
  mentor('Ananya Iyer', ['Math', 'Science'], 'Explains math and science with kitchen-table experiments and plenty of worked examples.', 'uk'),
  mentor('Kavya Nair', ['English'], 'Builds confident readers and writers through storytelling, vocabulary games and gentle feedback.', 'uk'),
  mentor('Vikram Rao', ['Coding', 'Science'], 'Mixes hands-on science demos with beginner-friendly coding projects.', 'uk', 5), // no Friday
  mentor('Sneha Kulkarni', ['Math'], 'Makes math patient and visual, with number puzzles that turn mistakes into the interesting part.', 'us'),
  mentor('Aditya Joshi', ['Coding'], 'Guides young beginners from block-based coding to a first real Python program.', 'us'),
  mentor('Meera Pillai', ['Science'], 'Runs curious, question-driven science lessons built around experiments that can be done at home.', 'us'),
  mentor('Karan Malhotra', ['Coding', 'Math'], 'Pairs logic puzzles with coding and math practice, always at the pace of the child.', 'us'),
  mentor('Divya Reddy', ['English', 'Math'], 'Helps children find a voice in English and steady footing in math, one friendly session at a time.', 'us', 2), // no Tuesday
];

// Made-up families, cycled through by the pre-booked classes.
const PARENTS = [
  { name: 'Emma Clarke', childName: 'Noah', parentTimeZone: 'Europe/London' },
  { name: 'Jacob Miller', childName: 'Ava', parentTimeZone: 'America/New_York' },
  { name: 'Olivia Brooks', childName: 'Leo', parentTimeZone: 'America/Chicago' },
  { name: 'Liam Carter', childName: 'Mia', parentTimeZone: 'America/Los_Angeles' },
];

async function upsertMentors(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const m of SEED_MENTORS) {
      const { rows } = await client.query(
        `insert into mentors (name, email, time_zone, bio, subjects) values ($1, $2, $3, $4, $5)
         on conflict (email) do update set name = excluded.name, time_zone = excluded.time_zone, bio = excluded.bio, subjects = excluded.subjects
         returning id`,
        [m.name, m.email, MENTOR_TIME_ZONE, m.bio, m.subjects],
      );
      await client.query('delete from mentor_hours where mentor_id = $1', [rows[0].id]);
      for (const h of m.hours) {
        await client.query('insert into mentor_hours (mentor_id, weekday, start_time, end_time) values ($1, $2, $3, $4)', [rows[0].id, h.weekday, h.start, h.end]);
      }
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {}); // keep the first error
    throw err;
  } finally {
    client.release();
  }
}

/** A fully booked stretch two days out and one full hour later on, so a demo always has both. Only on an empty bookings table. */
async function preBook(pool: pg.Pool, now: Date): Promise<number> {
  if ((await pool.query('select count(*)::int as n from bookings')).rows[0].n > 0) return 0;

  // the same margins the slots endpoint uses
  const openSlots = async () =>
    buildSlots(await loadMentors(pool), await loadActiveBookings(pool, new Date(now.getTime() - 2 * DAY_MS), new Date(now.getTime() + 16 * DAY_MS)), now).filter((s) => s.available);

  let booked = 0;
  const bookUntilFull = async (startsAt: Date): Promise<void> => {
    for (;;) {
      const parent = PARENTS[booked % PARENTS.length]!;
      const result = await bookSlot(pool, { startsAt, parentName: parent.name, parentEmail: `parent${(booked % PARENTS.length) + 1}@example.com`, childName: parent.childName, parentTimeZone: parent.parentTimeZone }, now);
      if (!result.ok) return;
      booked++;
    }
  };

  // Any 50-hour block holds a whole local day in every zone, so London, New York and Los Angeles all see a day marked full.
  const blockStart = now.getTime() + 2 * DAY_MS;
  const blockEnd = blockStart + 50 * HOUR_MS;
  for (const slot of await openSlots()) {
    if (slot.startsAt.getTime() >= blockStart && slot.startsAt.getTime() < blockEnd) await bookUntilFull(slot.startsAt);
  }

  // 16:00 UTC is a UK-shift hour on weekdays, so it fills while the other hours that day stay open.
  const popular = (await openSlots()).find((s) => s.startsAt.getTime() >= now.getTime() + 5 * DAY_MS && s.startsAt.getUTCHours() === 16);
  if (popular) await bookUntilFull(popular.startsAt);
  return booked;
}

/** Safe to repeat: mentors and their hours are rewritten each run, classes are pre-booked only once. */
export async function seed(pool: pg.Pool, now: Date): Promise<{ mentors: number; preBooked: number }> {
  await upsertMentors(pool);
  return { mentors: SEED_MENTORS.length, preBooked: await preBook(pool, now) };
}
