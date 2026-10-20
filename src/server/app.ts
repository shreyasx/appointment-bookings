import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import type { ApiErrorBody, BookingDto, ErrorCode, MentorsResponse, SlotsResponse } from '../shared/types.ts';
import { isValidTimeZone } from '../shared/time.ts';
import { bookSlot, getBookingWithMentor, loadActiveBookings, loadMentors, type Booking } from './bookings.ts';
import { renderEmails, type Mailer } from './email.ts';
import { buildSlots, CLASS_MINUTES, type Mentor } from './slots.ts';

export type Clock = { now: () => Date; demo: boolean };

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const END_OF_TIME = new Date('9999-12-31T00:00:00Z');

/** The only reader of the real time. A DEMO_NOW makes the clock start there and keep ticking. */
export function createClock(demoNow: string | undefined, realNow: () => number = Date.now): Clock {
  if (!demoNow) return { now: () => new Date(realNow()), demo: false };
  // Date.parse alone accepts 'Oct 20 2026' and reads a time with no offset in the host zone
  if (!z.iso.datetime({ offset: true }).safeParse(demoNow).success) throw new Error('DEMO_NOW must be an ISO instant');
  const offset = Date.parse(demoNow) - realNow();
  return { now: () => new Date(realNow() + offset), demo: true };
}

const name = z.string().trim().min(1, 'Required').max(80).regex(/^[^\p{Cc}\p{Zl}\p{Zp}]*$/u, 'No line breaks or control characters');
const bookingBody = z.object({
  startsAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)).refine((d) => d.getTime() % HOUR_MS === 0, 'Must start on the UTC hour'),
  parentName: name,
  parentEmail: z.email().max(254),
  childName: name,
  parentTimeZone: z.string().max(64).refine(isValidTimeZone, 'Unknown time zone'),
});

const STATUS: Record<ErrorCode, number> = { VALIDATION_FAILED: 400, SLOT_UNAVAILABLE: 409, NOT_FOUND: 404, INTERNAL: 500 };
const fail = (res: Response, code: ErrorCode, message: string, fields?: Record<string, string>): void => {
  res.status(STATUS[code]).json({ error: { code, message, fields } } satisfies ApiErrorBody);
};

const toDto = ({ booking: b, mentor: m }: { booking: Booking; mentor: Mentor }): BookingDto => ({
  id: b.id,
  startsAt: b.startsAt.toISOString(),
  endsAt: new Date(b.startsAt.getTime() + CLASS_MINUTES * 60_000).toISOString(),
  childName: b.childName,
  parentName: b.parentName,
  parentEmail: b.parentEmail,
  parentTimeZone: b.parentTimeZone,
  classLink: b.classLink,
  mentor: { name: m.name, bio: m.bio, subjects: m.subjects, timeZone: m.timeZone },
});

export function createApp(deps: {
  pool: pg.Pool;
  clock: Clock;
  mailer: Mailer;
  appUrl: string;
  webDir?: string;
  log?: (message: string, error?: unknown) => void;
}): Express {
  const { pool, clock, mailer, appUrl, webDir, log = console.error } = deps;
  const app = express();
  app.disable('x-powered-by');

  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json());

  app.get('/api/slots', async (_req, res) => {
    const now = clock.now();
    // wide margins, so earlier bookings that still count toward a mentor's day are included
    const [mentors, bookings] = await Promise.all([loadMentors(pool), loadActiveBookings(pool, new Date(now.getTime() - 2 * DAY_MS), new Date(now.getTime() + 16 * DAY_MS))]);
    const slots = buildSlots(mentors, bookings, now).map((s) => ({ startsAt: s.startsAt.toISOString(), available: s.available }));
    res.json({ now: now.toISOString(), demo: clock.demo, slots } satisfies SlotsResponse);
  });

  app.post('/api/bookings', async (req, res) => {
    const input = bookingBody.parse(req.body ?? {});
    const result = await bookSlot(pool, input, clock.now());
    if (!result.ok) return fail(res, 'SLOT_UNAVAILABLE', 'That time is no longer available. Please pick another.');
    const found = await getBookingWithMentor(pool, result.booking.id);
    if (!found) throw new Error(`booking ${result.booking.id} is missing right after it was made`);
    res.status(201).json({ booking: toDto(found) });

    // after the response, so a mail failure never fails a booking; the catch keeps a render error away from Express's default handler
    try {
      const { parent, mentor } = renderEmails({ ...found.booking, mentor: found.mentor }, appUrl);
      const sends = await Promise.allSettled([parent, mentor].map(async (message) => mailer.send(message)));
      for (const send of sends) if (send.status === 'rejected') log('could not send a booking email', send.reason);
    } catch (err) {
      log('could not prepare the booking emails', err);
    }
  });

  app.get('/api/bookings/:id', async (req, res) => {
    const id = z.uuid().safeParse(req.params.id); // a malformed id would make Postgres throw
    const found = id.success ? await getBookingWithMentor(pool, id.data) : null;
    if (!found) return fail(res, 'NOT_FOUND', 'No such booking.');
    res.json({ booking: toDto(found) });
  });

  app.get('/api/mentors', async (_req, res) => {
    const now = clock.now();
    const [mentors, bookings] = await Promise.all([loadMentors(pool), loadActiveBookings(pool, now, END_OF_TIME)]);
    bookings.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    res.json({
      now: now.toISOString(),
      demo: clock.demo,
      mentors: mentors.map((m) => ({
        id: m.id,
        name: m.name,
        bio: m.bio,
        subjects: m.subjects,
        timeZone: m.timeZone,
        bookings: bookings.filter((b) => b.mentorId === m.id).map((b) => ({ startsAt: b.startsAt.toISOString() })),
      })),
    } satisfies MentorsResponse);
  });

  app.use('/api', (_req, res) => fail(res, 'NOT_FOUND', 'No such endpoint.'));

  if (webDir) {
    app.use(express.static(webDir));
    app.get('/{*splat}', (_req, res) => res.sendFile('index.html', { root: webDir }));
  }

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err instanceof z.ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of err.issues) fields[issue.path.join('.')] ??= issue.message;
      return fail(res, 'VALIDATION_FAILED', 'Some details need fixing.', fields);
    }
    // body-parser's client errors (bad JSON, too large, unknown encoding) carry a string type and a 4xx status; sendFile's ENOENT has only a status
    const { type, status } = err as { type?: unknown; status?: unknown };
    if (typeof type === 'string' && typeof status === 'number' && status >= 400 && status < 500) {
      return fail(res, 'VALIDATION_FAILED', type === 'entity.parse.failed' ? 'The request body is not valid JSON.' : 'The request could not be read.');
    }
    log('unhandled error', err);
    fail(res, 'INTERNAL', 'Something went wrong. Please try again.');
  });

  return app;
}
