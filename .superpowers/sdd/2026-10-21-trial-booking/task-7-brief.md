### Task 7: HTTP API, validation and the clock

**Files:**
- Create: `src/shared/types.ts`, `src/server/app.ts`, `src/server/api.test.ts`
- Modify: `package.json` (dependencies `express@5`, `zod@4`; dev dependencies `@types/express`, `supertest`, `@types/supertest`)

**Interfaces:**
- Consumes:
  - `loadMentors`, `loadActiveBookings`, `bookSlot`, `getBookingWithMentor` (Task 5);
  - `buildSlots` (Task 4);
  - `renderEmails`, `Mailer`, and `createSmtpMailer` for the dead-port test (Task 6);
  - `isValidTimeZone` (Task 1).
- Produces:
  - `src/shared/types.ts`:

```ts
export type ErrorCode = 'VALIDATION_FAILED' | 'SLOT_UNAVAILABLE' | 'NOT_FOUND' | 'INTERNAL';
export type ApiErrorBody = { error: { code: ErrorCode; message: string; fields?: Record<string, string> } };
export type SlotDto = { startsAt: string; available: boolean };
export type SlotsResponse = { now: string; demo: boolean; slots: SlotDto[] };
export type MentorDto = { id: number; name: string; bio: string; subjects: string[]; timeZone: string; bookings: { startsAt: string }[] };
export type MentorsResponse = { now: string; demo: boolean; mentors: MentorDto[] };
export type BookingRequest = { startsAt: string; parentName: string; parentEmail: string; childName: string; parentTimeZone: string };
export type BookingDto = { id: string; startsAt: string; endsAt: string; childName: string; parentName: string; parentEmail: string;
  parentTimeZone: string; classLink: string; mentor: { name: string; bio: string; subjects: string[]; timeZone: string } };
export type BookingResponse = { booking: BookingDto };
```

  - `src/server/app.ts`:

```ts
export type Clock = { now: () => Date; demo: boolean };
export function createClock(demoNow: string | undefined, realNow?: () => number): Clock;  // realNow defaults to Date.now
export function createApp(deps: { pool: Pool; clock: Clock; mailer: Mailer; appUrl: string; webDir?: string;
  log?: (message: string, error?: unknown) => void }): Express;                            // log defaults to console.error
```

- [ ] **Step 1: Write the failing tests** in `src/server/api.test.ts`
  - One database for the file. Two mentors in `Asia/Kolkata` with `ukHours` (weekdays 1–5, `'20:30'`–`'23:30'`).
  - A fake mailer pushes into `sent: EmailMessage[]`.
  - `NOW = new Date('2026-10-20T12:00:00Z')`, `clock = { now: () => NOW, demo: false }`.
  - `valid` is a London booking request for `'2026-10-27T16:00:00Z'`.
  - Tests run in file order, and each uses its own date.

```ts
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
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/server/api.test.ts`
Expected: FAIL, failing to resolve `./app.ts`.

- [ ] **Step 3: Implement `src/shared/types.ts` and `src/server/app.ts`**
  - **`createClock`**: an empty or missing value means the real clock. Otherwise compute `offset = Date.parse(demoNow) - realNow()` once and return `{ now: () => new Date(realNow() + offset), demo: true }`. If `z.iso.datetime({ offset: true }).safeParse(demoNow)` fails, throw `Error('DEMO_NOW must be an ISO instant')`; `Date.parse` alone accepts `'Oct 20 2026'` and reads offset-less times in the host zone.
  - **Body schema (Zod 4)**:
    - `startsAt`: `z.iso.datetime({ offset: true })`, converted to a `Date`, then refined to be exactly on the UTC hour.
    - `parentName` and `childName`: `z.string().trim().min(1).max(80).regex(/^[^\p{Cc}]*$/u)`.
    - `parentEmail`: `z.email().max(254)`.
    - `parentTimeZone`: `z.string().max(64).refine(isValidTimeZone)`.
  - **Routes**, in this order:
    1. A middleware that sets `Cache-Control: no-store` on `/api`.
    2. `express.json()`.
    3. `GET /api/slots`: `buildSlots(loadMentors, loadActiveBookings(now − 2 days, now + 16 days), now)`. The wide margins include earlier bookings that still count toward a mentor's day.
    4. `POST /api/bookings`:
       - Call `bookSlot`.
       - Respond 201 with a `BookingDto` (load the mentor with `getBookingWithMentor`), or 409.
       - *After* responding, `await Promise.allSettled` both `mailer.send` calls and `log` any rejection.
    5. `GET /api/bookings/:id`: validate with `z.uuid()`, otherwise 404.
    6. `GET /api/mentors`: each mentor's active bookings with `startsAt ≥ now`, mapped to `{ startsAt }`.
    7. `app.use('/api', …)`: JSON 404 for unknown API routes.
    8. Only when `webDir` is given: `express.static(webDir)` and the SPA fallback `app.get('/{*splat}', …)` sending `index.html`. Express 5 needs that named wildcard.
    9. The error middleware:
       - `ZodError`: 400 `VALIDATION_FAILED`, with `fields` keyed by `issue.path.join('.')`.
       - `err.type === 'entity.parse.failed'`: 400 `VALIDATION_FAILED`.
       - Anything else: log it and return 500 `INTERNAL`.
  - `app.disable('x-powered-by')`.

- [ ] **Step 4: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/server/app.ts src/server/api.test.ts package.json package-lock.json
git commit -m "feat(api): add slots, bookings and mentors endpoints with zod validation"
```

---

