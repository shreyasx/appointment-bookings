import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import type { MentorDto } from '../shared/types.ts';
import { createApp, createClock } from './app.ts';
import { createSmtpMailer, type EmailMessage, type Mailer } from './email.ts';
import { createTestDb, insertMentor, type TestDb } from './test-db.ts';

let db: TestDb;
let pool: TestDb['pool'];
const sent: EmailMessage[] = [];
const mailer: Mailer = { send: async (message) => void sent.push(message) };
const NOW = new Date('2026-10-20T12:00:00Z');
const clock = { now: () => NOW, demo: false };
// weekdays 1-5, 20:30-23:30 in Asia/Kolkata: classes at 15:00, 16:00 and 17:00 UTC
const ukHours = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '20:30', end: '23:30' }));
const valid = { startsAt: '2026-10-27T16:00:00Z', parentName: 'Asha Patel', parentEmail: 'asha@example.com', childName: 'Rohan', parentTimeZone: 'Europe/London' };
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  db = await createTestDb();
  pool = db.pool;
  await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours });
  await insertMentor(pool, { timeZone: 'Asia/Kolkata', hours: ukHours });
  app = createApp({ pool, clock, mailer, appUrl: 'http://localhost:3000' });
});
afterAll(() => db.drop());

test('books a class, then emails both sides', async () => {
  const res = await request(app).post('/api/bookings').send(valid);
  expect(res.status).toBe(201);
  expect(res.body.booking).toMatchObject({ startsAt: '2026-10-27T16:00:00.000Z', endsAt: '2026-10-27T17:00:00.000Z',
    childName: 'Rohan', parentTimeZone: 'Europe/London', mentor: { timeZone: 'Asia/Kolkata' } });
  await vi.waitFor(() => expect(sent.map((m) => m.to)).toContain('asha@example.com'));
  expect(sent).toHaveLength(2);
});

test('accepts another offset for the same instant', async () => {
  const res = await request(app).post('/api/bookings').send({ ...valid, startsAt: '2026-10-27T18:00:00+01:00' });
  expect([res.status, res.body.booking.startsAt]).toEqual([201, '2026-10-27T17:00:00.000Z']);
});

test('rejects bad input with field errors', async () => {
  const res = await request(app).post('/api/bookings')
    .send({ ...valid, parentName: '   ', childName: 'Ro\nhan', parentEmail: 'nope', parentTimeZone: 'IST', startsAt: '2026-10-27T16:30:00Z' });
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_FAILED');
  expect(Object.keys(res.body.error.fields).sort()).toEqual(['childName', 'parentEmail', 'parentName', 'parentTimeZone', 'startsAt']);
});

test('rejects a body that is not JSON', async () => {
  const res = await request(app).post('/api/bookings').set('content-type', 'application/json').send('{oops');
  expect([res.status, res.body.error.code]).toEqual([400, 'VALIDATION_FAILED']);
});

test('a body over the JSON limit is a 400, not a server error', async () => {
  const log = vi.fn();
  const quiet = createApp({ pool, clock, mailer, appUrl: '', log });
  const res = await request(quiet).post('/api/bookings').send({ ...valid, parentName: 'x'.repeat(200_000) });
  expect([res.status, res.body.error.code]).toEqual([400, 'VALIDATION_FAILED']);
  expect(log).not.toHaveBeenCalled();
});

test('names with line or paragraph separators are rejected', async () => {
  const res = await request(app).post('/api/bookings').send({ ...valid, parentName: 'As\u2029ha', childName: 'Ro\u2028han' });
  expect(res.status).toBe(400);
  expect(Object.keys(res.body.error.fields).sort()).toEqual(['childName', 'parentName']);
});

test('409 when nobody is left for that hour, or it is too soon', async () => {
  const at = { ...valid, startsAt: '2026-10-28T15:00:00Z' };
  await request(app).post('/api/bookings').send(at);
  await request(app).post('/api/bookings').send(at);
  for (const body of [at, { ...valid, startsAt: '2026-10-20T13:00:00Z' }]) {
    const res = await request(app).post('/api/bookings').send(body);
    expect([res.status, res.body.error.code]).toEqual([409, 'SLOT_UNAVAILABLE']);
  }
});

test('fetches a booking by id, and 404s otherwise', async () => {
  const made = await request(app).post('/api/bookings').send({ ...valid, startsAt: '2026-10-29T15:00:00Z' });
  const res = await request(app).get(`/api/bookings/${made.body.booking.id}`);
  expect(res.body.booking.id).toBe(made.body.booking.id);
  for (const id of [randomUUID(), 'abc']) expect((await request(app).get(`/api/bookings/${id}`)).body.error.code).toBe('NOT_FOUND');
});

test('lists slots from the app clock, full hours included', async () => {
  const res = await request(app).get('/api/slots');
  expect([res.body.now, res.body.demo]).toEqual(['2026-10-20T12:00:00.000Z', false]);
  expect(res.body.slots[0].startsAt).toBe('2026-10-20T15:00:00.000Z');
  expect(res.body.slots).toContainEqual({ startsAt: '2026-10-28T15:00:00.000Z', available: false });
});

test('lists mentors with upcoming booking times only', async () => {
  const res = await request(app).get('/api/mentors');
  expect(res.body.mentors).toHaveLength(2);
  const times = res.body.mentors.flatMap((m: MentorDto) => m.bookings);
  expect(times.length).toBeGreaterThan(0);
  expect(times.every((b: object) => Object.keys(b).join() === 'startsAt')).toBe(true);
});

test('every /api response is no-store, and unknown routes are JSON 404s', async () => {
  expect((await request(app).get('/api/slots')).headers['cache-control']).toBe('no-store');
  const res = await request(app).get('/api/nope');
  expect([res.status, res.headers['cache-control'], res.body.error.code]).toEqual([404, 'no-store', 'NOT_FOUND']);
});

test('the booking is answered before any email settles', async () => {
  const stuck = createApp({ pool, clock, appUrl: '', mailer: { send: () => new Promise<void>(() => {}) } }); // never settles
  const res = await request(stuck).post('/api/bookings').send({ ...valid, startsAt: '2026-11-02T15:00:00Z' });
  expect(res.status).toBe(201);
});

test('a failing mailer never fails the booking', async () => {
  const log = vi.fn();
  const broken = createApp({ pool, clock, appUrl: '', log, mailer: createSmtpMailer('smtp://127.0.0.1:9') }); // nothing listens on port 9
  const res = await request(broken).post('/api/bookings').send({ ...valid, startsAt: '2026-10-30T15:00:00Z' });
  expect(res.status).toBe(201);
  await vi.waitFor(() => expect(log).toHaveBeenCalled());
});

test('the app clock drives slots, booking and the mentors list', async () => {
  // a clock before any real run, so a route that reads new Date() fails here
  const demo = createApp({ pool, clock: { now: () => new Date('2026-10-14T13:30:00Z'), demo: true }, mailer, appUrl: '' });
  const slots = (await request(demo).get('/api/slots')).body;
  expect([slots.now, slots.demo, slots.slots[0].startsAt])
    .toEqual(['2026-10-14T13:30:00.000Z', true, '2026-10-14T16:00:00.000Z']); // 15:00Z is under 2 hours away
  expect((await request(demo).post('/api/bookings').send({ ...valid, startsAt: '2026-10-15T15:00:00Z' })).status).toBe(201);
  const mentors = (await request(demo).get('/api/mentors')).body;
  expect(mentors.demo).toBe(true);
  expect(mentors.now).toBe('2026-10-14T13:30:00.000Z');
  expect(mentors.mentors.flatMap((m: MentorDto) => m.bookings.map((b) => b.startsAt))).toContain('2026-10-15T15:00:00.000Z');
});

test('createClock: real by default, demo clock starts at DEMO_NOW and keeps ticking', () => {
  let real = 1_000_000;
  expect(createClock(undefined, () => real)).toMatchObject({ demo: false });
  expect(createClock('', () => real).now().getTime()).toBe(1_000_000);
  const c = createClock('2026-10-20T12:00:00Z', () => real);
  expect([c.demo, c.now().toISOString()]).toEqual([true, '2026-10-20T12:00:00.000Z']);
  real += 90_000;
  expect(c.now().toISOString()).toBe('2026-10-20T12:01:30.000Z');
  expect(() => createClock('next tuesday')).toThrow(/DEMO_NOW/);
  expect(() => createClock('2026-10-20T12:00:00')).toThrow(/DEMO_NOW/); // no offset would read in the host zone
});
