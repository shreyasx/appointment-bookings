### Task 9: Booking-flow logic for the browser (pure)

**Files:**
- Create: `src/web/booking.ts`, `src/web/booking.test.ts`

**Interfaces:**
- Consumes:
  - `localDate`, `addDays`, `offsetMinutes`, `zonedTimeToInstant`, `zoneAbbreviation`, `formatZoneOption`, `canonicalTimeZone`, `isValidTimeZone` (Tasks 1–2);
  - `SlotDto` (Task 7).
- Produces (`src/web/booking.ts`):

```ts
export const DAYS_SHOWN = 14;
export const COMMON_ZONES = ['America/Los_Angeles', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/New_York',
  'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Dublin', 'Asia/Kolkata'];
export type Day = { key: string; slots: SlotDto[]; openCount: number };
export function groupIntoDays(slots: SlotDto[], tz: string, now: Date): Day[];                // exactly 14 days from today in tz
export function shownDayKey(days: Day[], selected: string | null, chosenDay: string | null, tz: string): string;
export function nearestOpenTimes(slots: SlotDto[], target: string, count?: number): string[]; // default 3, returned in time order
export function nearestOpenDays(days: Day[], key: string): { before: Day | null; after: Day | null };
export function clockChange(days: Day[], tz: string, now: Date): { dayKey: string; from: string; to: string } | null;
export function dayMixesOffsets(day: Day, tz: string): boolean;
export function zoneOptions(current: string, now: Date): { value: string; label: string; group: 'common' | 'all' }[];
export function initialTimeZone(stored: string | null, device: string): string;
export function sameZone(a: string, b: string): boolean;
export type Details = { parentName: string; parentEmail: string; childName: string };
export type FlowState = { step: 'details' | 'time'; details: Details; chosenDay: string | null; selected: string | null; unavailable: string | null };
export type FlowAction =
  | { type: 'detailsSubmitted'; details: Details } | { type: 'back' } | { type: 'daySelected'; dayKey: string }
  | { type: 'slotSelected'; startsAt: string } | { type: 'slotUnavailable'; startsAt: string };
export const initialFlow: FlowState;
export function flowReducer(state: FlowState, action: FlowAction): FlowState;
```

- [ ] **Step 1: Write the failing tests** in `src/web/booking.test.ts`. Use `NOW = new Date('2026-10-20T12:00:00Z')` and `slot(iso, available = true)`.

```ts
test('groups into exactly 14 local days starting today, ignoring later slots', () => {
  const days = groupIntoDays([slot('2026-10-20T15:00:00Z'), slot('2026-11-02T23:00:00Z'), slot('2026-11-03T10:00:00Z')], 'Europe/London', NOW);
  expect(days.map((d) => d.key)).toEqual(Array.from({ length: 14 }, (_, i) => addDays('2026-10-20', i)));
  expect(days.at(-1)!.slots.map((s) => s.startsAt)).toEqual(['2026-11-02T23:00:00Z']);
});

test('each repeated 1:00 AM lands on its own change day', () => {
  const london = groupIntoDays([slot('2026-10-25T00:00:00Z'), slot('2026-10-25T01:00:00Z')], 'Europe/London', NOW);
  expect(london.find((d) => d.key === '2026-10-25')!.slots).toHaveLength(2);
  const ny = groupIntoDays([slot('2026-11-01T05:00:00Z'), slot('2026-11-01T06:00:00Z')], 'America/New_York', NOW);
  expect(ny.find((d) => d.key === '2026-11-01')!.slots).toHaveLength(2);
});

test('openCount ignores full hours', () => {
  const [today] = groupIntoDays([slot('2026-10-20T15:00:00Z'), slot('2026-10-20T16:00:00Z', false)], 'Europe/London', NOW);
  expect(today!.openCount).toBe(1);
});

test('shownDayKey: the selected time, then the chosen day, then the first open day', () => {
  const days = groupIntoDays([slot('2026-10-22T15:00:00Z'), slot('2026-10-27T01:00:00Z')], 'America/Los_Angeles', NOW);
  expect(shownDayKey(days, '2026-10-27T01:00:00Z', '2026-10-22', 'America/Los_Angeles')).toBe('2026-10-26'); // selected wins
  expect(shownDayKey(days, null, '2026-10-24', 'America/Los_Angeles')).toBe('2026-10-24');
  expect(shownDayKey(days, null, '2026-10-19', 'America/Los_Angeles')).toBe('2026-10-22'); // dropped at midnight
  const kolkataDays = groupIntoDays([slot('2026-10-27T01:00:00Z')], 'Asia/Kolkata', NOW);
  expect(shownDayKey(kolkataDays, '2026-10-27T01:00:00Z', null, 'Asia/Kolkata')).toBe('2026-10-27'); // zone changed
});

test('nearestOpenTimes ranks by distance, returns time order, skips the target and full hours', () => {
  const slots = [slot('2026-10-27T14:00:00Z'), slot('2026-10-27T15:00:00Z'), slot('2026-10-27T16:00:00Z', false),
    slot('2026-10-27T17:00:00Z', false), slot('2026-10-27T21:00:00Z'), slot('2026-10-27T22:00:00Z')];
  expect(nearestOpenTimes(slots, '2026-10-27T16:00:00Z')).toEqual(['2026-10-27T14:00:00Z', '2026-10-27T15:00:00Z', '2026-10-27T21:00:00Z']);
});

test('nearestOpenDays looks both ways, or finds none', () => {
  const days = groupIntoDays([slot('2026-10-21T15:00:00Z'), slot('2026-10-24T10:00:00Z')], 'Europe/London', NOW);
  expect(nearestOpenDays(days, '2026-10-22')).toEqual({ before: days[1], after: days[4] });
  expect(nearestOpenDays(groupIntoDays([], 'Europe/London', NOW), '2026-10-22')).toEqual({ before: null, after: null });
});

test("clockChange finds each zone's change in the window", () => {
  const days = (tz: string) => groupIntoDays([], tz, NOW);
  expect(clockChange(days('Europe/London'), 'Europe/London', NOW)).toEqual({ dayKey: '2026-10-25', from: 'BST', to: 'GMT' });
  expect(clockChange(days('America/New_York'), 'America/New_York', NOW)).toEqual({ dayKey: '2026-11-01', from: 'EDT', to: 'EST' });
  expect(clockChange(days('Asia/Kolkata'), 'Asia/Kolkata', NOW)).toBeNull();
});

test('dayMixesOffsets is true only on the change day', () => {
  const days = groupIntoDays([slot('2026-10-25T00:00:00Z'), slot('2026-10-25T10:00:00Z'), slot('2026-10-27T15:00:00Z'), slot('2026-10-27T16:00:00Z')], 'Europe/London', NOW);
  expect(dayMixesOffsets(days.find((d) => d.key === '2026-10-25')!, 'Europe/London')).toBe(true);
  expect(dayMixesOffsets(days.find((d) => d.key === '2026-10-27')!, 'Europe/London')).toBe(false);
});

test('zoneOptions: common zones first, exactly one entry per zone, and the current spelling kept', () => {
  const calcutta = zoneOptions('Asia/Calcutta', NOW);
  expect(calcutta.slice(0, 10).map((o) => o.group)).toEqual(Array(10).fill('common'));
  expect(calcutta.filter((o) => sameZone(o.value, 'Asia/Kolkata')).map((o) => [o.value, o.label])).toEqual([['Asia/Calcutta', 'Kolkata (GMT+5:30)']]);
  expect(zoneOptions('Asia/Kolkata', NOW).filter((o) => sameZone(o.value, 'Asia/Kolkata')).map((o) => o.value)).toEqual(['Asia/Kolkata']);
  expect(calcutta.find((o) => o.value === 'Europe/London')!.label).toBe('London (GMT+1)');
});

test('initialTimeZone and sameZone', () => {
  expect(initialTimeZone('Europe/London', 'America/New_York')).toBe('Europe/London');
  expect(initialTimeZone('Mars/Base', 'America/New_York')).toBe('America/New_York');
  expect(initialTimeZone(null, 'America/New_York')).toBe('America/New_York');
  expect(sameZone('Asia/Kolkata', 'Asia/Calcutta')).toBe(true);
});

test('flowReducer keeps details through a 409 and clears the selection', () => {
  const details = { parentName: 'Asha Patel', parentEmail: 'asha@example.com', childName: 'Rohan' };
  let s = flowReducer(initialFlow, { type: 'detailsSubmitted', details });
  expect(s.step).toBe('time');
  s = flowReducer(s, { type: 'slotSelected', startsAt: '2026-10-27T16:00:00Z' });
  s = flowReducer(s, { type: 'slotUnavailable', startsAt: '2026-10-27T16:00:00Z' });
  expect(s).toMatchObject({ step: 'time', details, selected: null, unavailable: '2026-10-27T16:00:00Z' });
  expect(flowReducer(s, { type: 'daySelected', dayKey: '2026-10-28' })).toMatchObject({ chosenDay: '2026-10-28', selected: null });
  expect(flowReducer(s, { type: 'back' })).toMatchObject({ step: 'details', details });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/web/booking.test.ts`
Expected: FAIL, failing to resolve `./booking.ts`.

- [ ] **Step 3: Implement `src/web/booking.ts`**
  - **`groupIntoDays`**: the keys are `localDate(now, tz)` plus 0–13 days. Bucket each slot by `localDate(startsAt, tz)` and drop keys outside those 14.
  - **`shownDayKey`**, in order of preference:
    1. the selected slot's local day, if it's in `days`;
    2. otherwise `chosenDay`, if it's in `days`;
    3. otherwise the first day with `openCount > 0`;
    4. otherwise `days[0].key`.
  - **`nearestOpenTimes`**: only available slots other than the target. Sort by `|Δt|`, ties to the earlier slot, take `count`, then sort by time.
  - **`clockChange`**: the first day key whose offset at local noon (`zonedTimeToInstant(key, '12:00', tz)`) differs from `offsetMinutes(now, tz)`. `from` and `to` are the abbreviations at `now` and at that noon.
  - **`dayMixesOffsets`**: the day's slots have more than one distinct `offsetMinutes`.
  - **`zoneOptions`**:
    - Start with `COMMON_ZONES`, then `Intl.supportedValuesOf('timeZone')`, dropping any zone already present canonically.
    - Where an entry is canonically equal to `current`, use `current` as its `value`. If nothing matches, prepend `current` to the common group.
    - Labels come from `formatZoneOption(now, tz)`.
  - **`initialTimeZone`**: `stored` if it passes `isValidTimeZone`, otherwise `device`.
  - **`sameZone`**: compares `canonicalTimeZone` values.
  - **`flowReducer`**:
    - `detailsSubmitted`: set `step: 'time'` and `details`.
    - `back`: set `step: 'details'`.
    - `daySelected`: set `chosenDay`, and `selected: null`.
    - `slotSelected`: set `selected`, and `unavailable: null`.
    - `slotUnavailable`: set `selected: null` and `unavailable`.

- [ ] **Step 4: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times.

- [ ] **Step 5: Commit**

```bash
git add src/web/booking.ts src/web/booking.test.ts
git commit -m "feat(web): add pure day grouping, alternatives, zone options and flow reducer"
```

---

