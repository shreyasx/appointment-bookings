### Task 4: Slot rules (pure)

**Files:**
- Create: `src/server/slots.ts`, `src/server/slots.test.ts`

**Interfaces:**
- Consumes: `zonedTimeToInstant`, `localDate`, `weekdayOf`, `addDays` (Task 1).
- Produces (`src/server/slots.ts`):

```ts
export const CLASS_MINUTES = 60, LEAD_MINUTES = 120, HORIZON_DAYS = 14, DAILY_CAP = 2;
export type WorkingHours = { weekday: number; start: string; end: string };   // 'HH:MM', in the mentor's own time zone
export type Mentor = { id: number; name: string; email: string; bio: string; subjects: string[]; timeZone: string; hours: WorkingHours[] };
export type ActiveBooking = { mentorId: number; startsAt: Date; mentorLocalDate: string };
export type Slot = { startsAt: Date; available: boolean };
export function isBookableTime(startsAt: Date, now: Date): boolean;            // on the UTC hour, within [now+120min, now+14d]
export function worksAt(mentor: Mentor, startsAt: Date): boolean;              // the whole class fits one working-hours window
export function classStarts(mentor: Mentor, from: Date, to: Date): Date[];     // sorted, unique, inside [from, to]
export function buildSlots(mentors: Mentor[], bookings: ActiveBooking[], now: Date): Slot[];  // sorted by startsAt
```

- [ ] **Step 1: Write the failing tests** in `src/server/slots.test.ts`

```ts
import { expect, test } from 'vitest';
import { localDate } from '../shared/time.ts';
import { buildSlots, classStarts, isBookableTime, worksAt, type ActiveBooking, type Mentor, type Slot, type WorkingHours } from './slots.ts';

const NOW = new Date('2026-10-20T12:00:00Z');
const hours = (weekdays: number[], start: string, end: string): WorkingHours[] => weekdays.map((weekday) => ({ weekday, start, end }));
const mentor = (id: number, timeZone: string, h: WorkingHours[]): Mentor =>
  ({ id, name: `M${id}`, email: `m${id}@mentors.example`, bio: '', subjects: [], timeZone, hours: h });
const ukEvening = (id: number) => mentor(id, 'Asia/Kolkata', hours([1, 2, 3, 4, 5], '20:30', '23:30'));
const isoList = (dates: Date[]) => dates.map((d) => d.toISOString());
const slotAt = (slots: Slot[], iso: string) => slots.find((s) => s.startsAt.toISOString() === iso);
const booking = (mentorId: number, iso: string, day: string): ActiveBooking => ({ mentorId, startsAt: new Date(iso), mentorLocalDate: day });

test('weekly hours become class starts on the UTC hour', () => {
  expect(isoList(classStarts(ukEvening(1), new Date('2026-10-27T00:00:00Z'), new Date('2026-10-28T00:00:00Z'))))
    .toEqual(['2026-10-27T15:00:00.000Z', '2026-10-27T16:00:00.000Z', '2026-10-27T17:00:00.000Z']);
});

test('the window runs from 2 hours to 14 days ahead, both inclusive', () => {
  const slots = buildSlots([mentor(1, 'UTC', hours([0, 1, 2, 3, 4, 5, 6], '00:00', '23:59'))], [], NOW);
  expect(slots[0]!.startsAt.toISOString()).toBe('2026-10-20T14:00:00.000Z');
  expect(slots.at(-1)!.startsAt.toISOString()).toBe('2026-11-03T12:00:00.000Z');
  expect(isBookableTime(new Date('2026-10-20T14:00:00Z'), NOW)).toBe(true);
  expect(isBookableTime(new Date('2026-10-20T13:00:00Z'), NOW)).toBe(false); // too soon
  expect(isBookableTime(new Date('2026-10-20T14:30:00Z'), NOW)).toBe(false); // not on the hour
  expect(isBookableTime(new Date('2026-11-03T13:00:00Z'), NOW)).toBe(false); // beyond 14 days
});

test('an hour is full only when every mentor working it is taken', () => {
  const two = [ukEvening(1), ukEvening(2)];
  const at16 = (b: ActiveBooking[]) => slotAt(buildSlots(two, b, NOW), '2026-10-27T16:00:00.000Z')?.available;
  expect(at16([booking(1, '2026-10-27T16:00:00Z', '2026-10-27')])).toBe(true);
  expect(at16([booking(1, '2026-10-27T16:00:00Z', '2026-10-27'), booking(2, '2026-10-27T16:00:00Z', '2026-10-27')])).toBe(false);
});

test("the cap closes only the rest of the mentor's own day", () => {
  const slots = buildSlots([ukEvening(1)], [booking(1, '2026-10-27T15:00:00Z', '2026-10-27'), booking(1, '2026-10-27T16:00:00Z', '2026-10-27')], NOW);
  expect(slotAt(slots, '2026-10-27T17:00:00.000Z')?.available).toBe(false);
  expect(slotAt(slots, '2026-10-28T15:00:00.000Z')?.available).toBe(true);
});

test("a Los Angeles parent's Monday evening counts toward the mentor's Tuesday", () => {
  const laMonday = '2026-10-27T01:00:00Z'; // Mon 26 Oct, 6:00 PM PDT = Tue 27 Oct, 6:30 AM in Kolkata
  expect(localDate(new Date(laMonday), 'America/Los_Angeles')).toBe('2026-10-26');
  const m = mentor(1, 'Asia/Kolkata', [...hours([2], '06:30', '07:30'), ...hours([1, 2], '20:30', '22:30')]);
  const slots = buildSlots([m], [booking(1, laMonday, '2026-10-27'), booking(1, '2026-10-27T15:00:00Z', '2026-10-27')], NOW);
  expect(slotAt(slots, '2026-10-27T16:00:00.000Z')?.available).toBe(false); // Tuesday is at the cap
  expect(slotAt(slots, '2026-10-26T15:00:00.000Z')?.available).toBe(true);  // Monday is untouched
});

test("the cap uses the mentor's own day, not the UTC day", () => {
  // Tue 02:30-07:30 in Kolkata runs from Mon 26 Oct 21:00Z to Tue 27 Oct 02:00Z
  const m = mentor(1, 'Asia/Kolkata', hours([2], '02:30', '07:30'));
  const slots = buildSlots([m], [booking(1, '2026-10-26T21:00:00Z', '2026-10-27'), booking(1, '2026-10-26T22:00:00Z', '2026-10-27')], NOW);
  for (const iso of ['2026-10-26T23:00:00.000Z', '2026-10-27T00:00:00.000Z', '2026-10-27T01:00:00.000Z'])
    expect(slotAt(slots, iso)?.available).toBe(false); // the mentor's Tuesday is full on either UTC date
  expect(slotAt(slots, '2026-11-02T21:00:00.000Z')?.available).toBe(true); // next Tuesday is open
});

test('a mentor in New York on the spring-forward day', () => {
  const ny = (start: string, end: string) => mentor(1, 'America/New_York', hours([0], start, end));
  const day = [new Date('2026-03-08T00:00:00Z'), new Date('2026-03-09T00:00:00Z')] as const;
  expect(isoList(classStarts(ny('02:00', '05:00'), ...day))).toEqual(['2026-03-08T07:00:00.000Z', '2026-03-08T08:00:00.000Z']);
  expect(isoList(classStarts(ny('02:30', '05:30'), ...day))).toEqual(['2026-03-08T08:00:00.000Z']); // window starts 3:30 EDT; first class 4:00 EDT
});

test('a mentor in New York on the fall-back day', () => {
  const m = mentor(1, 'America/New_York', hours([0], '01:00', '03:00'));
  expect(isoList(classStarts(m, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-02T00:00:00Z'))))
    .toEqual(['2026-11-01T05:00:00.000Z', '2026-11-01T06:00:00.000Z', '2026-11-01T07:00:00.000Z']);
});

test("US-evening hours put both of London's 1:00 AM slots on 25 Oct", () => {
  const starts = buildSlots([mentor(6, 'Asia/Kolkata', hours([0, 2, 3, 4, 5, 6], '02:30', '07:30'))], [], NOW).map((s) => s.startsAt.toISOString());
  expect(starts).toEqual(expect.arrayContaining(['2026-10-25T00:00:00.000Z', '2026-10-25T01:00:00.000Z']));
});

test("worksAt fits the whole class inside the mentor's hours", () => {
  expect(worksAt(ukEvening(1), new Date('2026-10-27T17:00:00Z'))).toBe(true);  // 10:30-11:30 PM IST
  expect(worksAt(ukEvening(1), new Date('2026-10-27T18:00:00Z'))).toBe(false); // would end after 11:30 PM
  expect(worksAt(ukEvening(1), new Date('2026-10-25T15:00:00Z'))).toBe(false); // Sunday
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/server/slots.test.ts`
Expected: FAIL, failing to resolve `./slots.ts`.

- [ ] **Step 3: Implement `src/server/slots.ts`**
  - **`classStarts`**: loop over the mentor's local dates from `addDays(localDate(from, tz), -1)` to `addDays(localDate(to, tz), 1)`. For each hours row whose `weekday === weekdayOf(date)`:
    - the window is `[zonedTimeToInstant(date, start, tz), zonedTimeToInstant(date, end, tz)]`;
    - the first start is the window start rounded up to the UTC hour;
    - step one hour at a time while `start + 60 min ≤ windowEnd`;
    - keep starts inside `[from, to]`.
  - **`worksAt`**: the same window test, on `localDate(startsAt, tz)` only.
  - **`buildSlots`**:
    - Take `classStarts` over `[now + 120 min, now + 14 days]` for every mentor.
    - A (mentor, start) pair is open when there's no booking for that mentor at that instant, and the mentor's count for `localDate(start, mentor.timeZone)` is under `DAILY_CAP`.
    - Merge by instant: `available` is true if any pair is open.

- [ ] **Step 4: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times.

- [ ] **Step 5: Commit**

```bash
git add src/server/slots.ts src/server/slots.test.ts
git commit -m "feat(slots): turn weekly hours into utc class starts with cap and dst rules"
```

---

