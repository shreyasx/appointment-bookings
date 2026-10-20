import { addDays, localDate, weekdayOf, zonedTimeToInstant } from '../shared/time.ts';

export const CLASS_MINUTES = 60, LEAD_MINUTES = 120, HORIZON_DAYS = 14, DAILY_CAP = 2;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const CLASS_MS = CLASS_MINUTES * MINUTE_MS;

export type WorkingHours = { weekday: number; start: string; end: string }; // 'HH:MM', in the mentor's own time zone
export type Mentor = { id: number; name: string; email: string; bio: string; subjects: string[]; timeZone: string; hours: WorkingHours[] };
export type ActiveBooking = { mentorId: number; startsAt: Date; mentorLocalDate: string };
export type Slot = { startsAt: Date; available: boolean };

/** On the UTC hour, and inside [now + 120 minutes, now + 14 days], both ends inclusive. */
export function isBookableTime(startsAt: Date, now: Date): boolean {
  const t = startsAt.getTime();
  return t % HOUR_MS === 0 && t >= now.getTime() + LEAD_MINUTES * MINUTE_MS && t <= now.getTime() + HORIZON_DAYS * 24 * HOUR_MS;
}

/** The mentor's working windows on one of their own calendar days, as [open, close] in epoch ms. */
function windows(mentor: Mentor, date: string): [number, number][] {
  const weekday = weekdayOf(date);
  return mentor.hours
    .filter((h) => h.weekday === weekday)
    .map((h) => [zonedTimeToInstant(date, h.start, mentor.timeZone).getTime(), zonedTimeToInstant(date, h.end, mentor.timeZone).getTime()]);
}

/** True when the whole class fits one working-hours window on the mentor's own day. */
export function worksAt(mentor: Mentor, startsAt: Date): boolean {
  const t = startsAt.getTime();
  return windows(mentor, localDate(startsAt, mentor.timeZone)).some(([open, close]) => t >= open && t + CLASS_MS <= close);
}

/** Class starts on the UTC hour inside [from, to], sorted and unique. */
export function classStarts(mentor: Mentor, from: Date, to: Date): Date[] {
  const starts = new Set<number>();
  // a day either side, because the mentor's day can straddle the UTC date
  const last = addDays(localDate(to, mentor.timeZone), 1);
  for (let date = addDays(localDate(from, mentor.timeZone), -1); date <= last; date = addDays(date, 1)) {
    for (const [open, close] of windows(mentor, date)) {
      for (let t = Math.ceil(open / HOUR_MS) * HOUR_MS; t + CLASS_MS <= close; t += HOUR_MS) {
        if (t >= from.getTime() && t <= to.getTime()) starts.add(t);
      }
    }
  }
  return [...starts].sort((a, b) => a - b).map((t) => new Date(t));
}

/** Every bookable hour, open or full, sorted by start. An hour is open when any mentor working it is free and under the daily cap. */
export function buildSlots(mentors: Mentor[], bookings: ActiveBooking[], now: Date): Slot[] {
  const taken = new Set(bookings.map((b) => `${b.mentorId}|${b.startsAt.getTime()}`));
  const perDay = new Map<string, number>();
  for (const b of bookings) {
    const key = `${b.mentorId}|${b.mentorLocalDate}`;
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  const from = new Date(now.getTime() + LEAD_MINUTES * MINUTE_MS);
  const to = new Date(now.getTime() + HORIZON_DAYS * 24 * HOUR_MS);
  const open = new Map<number, boolean>();
  for (const mentor of mentors) {
    for (const start of classStarts(mentor, from, to)) {
      const t = start.getTime();
      const free = !taken.has(`${mentor.id}|${t}`) && (perDay.get(`${mentor.id}|${localDate(start, mentor.timeZone)}`) ?? 0) < DAILY_CAP;
      open.set(t, (open.get(t) ?? false) || free);
    }
  }
  return [...open].sort((a, b) => a[0] - b[0]).map(([t, available]) => ({ startsAt: new Date(t), available }));
}
