### Task 2: Time display formatting

**Files:**
- Modify: `src/shared/time.ts`, `src/shared/time.test.ts`

**Interfaces:**
- Consumes: `offsetMinutes`, `localDate` (Task 1).
- Produces (`src/shared/time.ts`):
  - `formatOffset(minutes: number): string`: `'GMT'`, `'GMT+1'`, `'GMT+5:30'`, `'GMT-4'`
  - `zoneAbbreviation(at: Date, tz: string): string`
  - `cityName(tz: string): string`
  - `canonicalTimeZone(tz: string): string`
  - `formatTime(at, tz)`: `'4:00 PM'`
  - `formatDate(at, tz)`: `'Tue 27 Oct'`
  - `formatDateWithYear(at, tz)`: `'Tue 27 Oct 2026'`
  - `formatDayKey(key: string): string`: `'Sun 25 Oct'`
  - `formatZone(at, tz)`: `'BST (London)'`
  - `formatWhen(at, tz)`: `'Tue 27 Oct, 4:00 PM BST (London)'`
  - `formatSpan(start: Date, end: Date, tz: string): string`: `'4:00–5:00 PM GMT (London)'`
  - `formatZoneOption(at, tz)`: `'London (GMT+1)'`
  - `formatOtherTime(at, tz, viewerTz)`: the other side's time for a reader in `viewerTz`: `'9:30 PM IST'`, or `'Tue 27 Oct, 2:30 AM IST'` when `at` falls on a different date in `tz` than in `viewerTz`
  - All `at` and `tz` parameters are `Date` and `string`; all return `string`.

- [ ] **Step 1: Write the failing tests** (append to `src/shared/time.test.ts`)

```ts
test.each([
  ['2026-10-27T16:00:00Z', 'Europe/London', 'Tue 27 Oct, 4:00 PM GMT (London)'],
  ['2026-10-23T15:00:00Z', 'Europe/London', 'Fri 23 Oct, 4:00 PM BST (London)'],
  ['2026-10-27T16:00:00Z', 'Asia/Kolkata', 'Tue 27 Oct, 9:30 PM IST (Kolkata)'],
  ['2026-10-27T16:00:00Z', 'Asia/Calcutta', 'Tue 27 Oct, 9:30 PM IST (Kolkata)'],
  ['2026-11-03T15:00:00Z', 'America/New_York', 'Tue 3 Nov, 10:00 AM EST (New York)'],
])('formatWhen(%s, %s)', (at, tz, expected) => expect(formatWhen(new Date(at), tz)).toBe(expected));

test.each([
  ['2026-07-15T12:00:00Z', 'Europe/Dublin', 'IST'], ['2026-01-15T12:00:00Z', 'Europe/Dublin', 'GMT'],
  ['2026-01-15T12:00:00Z', 'America/Phoenix', 'MST'], ['2026-07-15T12:00:00Z', 'America/Phoenix', 'MST'],
  ['2026-07-15T12:00:00Z', 'America/New_York', 'EDT'], ['2026-07-15T12:00:00Z', 'Asia/Tokyo', 'GMT+9'],
])('zoneAbbreviation(%s, %s) is %s', (at, tz, expected) => expect(zoneAbbreviation(new Date(at), tz)).toBe(expected));

test.each([
  ['2026-10-27T16:00:00Z', '2026-10-27T17:00:00Z', 'Europe/London', '4:00–5:00 PM GMT (London)'],
  ['2026-10-27T11:00:00Z', '2026-10-27T12:00:00Z', 'Europe/London', '11:00 AM–12:00 PM GMT (London)'],
  ['2026-10-25T00:00:00Z', '2026-10-25T01:00:00Z', 'Europe/London', '1:00 AM BST–1:00 AM GMT (London)'],
  ['2026-10-27T16:00:00Z', '2026-10-27T17:00:00Z', 'Asia/Kolkata', '9:30–10:30 PM IST (Kolkata)'],
])('formatSpan(%s, %s, %s)', (start, end, tz, expected) => {
  expect(formatSpan(new Date(start), new Date(end), tz)).toBe(expected);
});

test('dates, cities, offsets and picker labels', () => {
  expect(formatDateWithYear(new Date('2026-10-27T16:00:00Z'), 'Europe/London')).toBe('Tue 27 Oct 2026');
  expect(formatDayKey('2026-10-25')).toBe('Sun 25 Oct');
  expect(['America/New_York', 'America/Indiana/Indianapolis', 'Asia/Calcutta', 'Europe/Kiev', 'UTC'].map(cityName))
    .toEqual(['New York', 'Indianapolis', 'Kolkata', 'Kyiv', 'UTC']);
  expect([0, 60, 330, -240, 345].map(formatOffset)).toEqual(['GMT', 'GMT+1', 'GMT+5:30', 'GMT-4', 'GMT+5:45']);
  expect(formatZoneOption(new Date('2026-07-15T12:00:00Z'), 'Europe/London')).toBe('London (GMT+1)');
  expect(formatZoneOption(new Date('2026-01-15T12:00:00Z'), 'Europe/London')).toBe('London (GMT)');
  expect(formatZoneOption(new Date('2026-07-15T12:00:00Z'), 'Asia/Kolkata')).toBe('Kolkata (GMT+5:30)');
  expect(canonicalTimeZone('Asia/Kolkata')).toBe(canonicalTimeZone('Asia/Calcutta'));
  expect(formatTime(new Date('2026-10-27T16:00:00Z'), 'Europe/London')).not.toMatch(/\u202f/);
});

test("the other side's time carries its date when the two sides are on different days", () => {
  const usEvening = new Date('2026-10-26T21:00:00Z'); // Mon 5:00 PM in New York = Tue 2:30 AM in Kolkata
  expect(formatOtherTime(new Date('2026-10-27T16:00:00Z'), 'Asia/Kolkata', 'Europe/London')).toBe('9:30 PM IST');
  expect(formatOtherTime(usEvening, 'Asia/Kolkata', 'America/New_York')).toBe('Tue 27 Oct, 2:30 AM IST');
  expect(formatOtherTime(usEvening, 'America/New_York', 'Asia/Kolkata')).toBe('Mon 26 Oct, 5:00 PM EDT');
});
```

- [ ] **Step 2: Run the tests and see the new ones fail**

Run: `npx vitest run src/shared/time.test.ts`
Expected: FAIL. The new tests throw `TypeError: formatWhen is not a function` (and the like); the Task 1 tests still pass.

- [ ] **Step 3: Implement the formatters in `src/shared/time.ts`**
  - **`formatTime`**: `en-US` with `{ hour: 'numeric', minute: '2-digit' }`, then replace U+202F with a plain space.
  - **`formatDate`**: `en-GB` with `{ weekday: 'short', day: 'numeric', month: 'short' }`.
  - **`formatDateWithYear`**: `formatDate` plus a space plus the `year` part. Don't ask `en-GB` for the year, because that inserts a comma after the weekday.
  - **`formatDayKey(key)`**: `formatDate(new Date(key + 'T12:00:00Z'), 'UTC')`.
  - **`zoneAbbreviation`**: take the first of `['en-US', 'en-GB', 'en-IE', 'en-IN', 'en-CA', 'en-AU']` whose `timeZoneName: 'short'` part doesn't match `/^(GMT|UTC)[+-]/`. If none qualifies, return `formatOffset(offsetMinutes(at, tz))`. Mark it with `// ponytail: six English locales cover the zones we serve; add a per-zone map if one picks a wrong name`.
  - **`cityName`**:
    - alias map `{ 'Asia/Calcutta': 'Kolkata', 'Europe/Kiev': 'Kyiv', 'Asia/Saigon': 'Ho Chi Minh City' }`;
    - otherwise the last `/` segment with `_` turned into spaces.
  - **`canonicalTimeZone`**: `new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone`.
  - **`formatSpan`**:
    - If start and end have different offsets: `${time} ${abbr}–${time} ${abbr} (${city})`.
    - Otherwise, if both share AM/PM: `'4:00–5:00 PM GMT (London)'`.
    - Otherwise: `'11:00 AM–12:00 PM GMT (London)'`.
    - The separator is an en dash (U+2013).
  - **`formatZoneOption`**: `${cityName} (${formatOffset(offsetMinutes)})`.
  - **`formatOtherTime`**: `${formatTime} ${zoneAbbreviation}`, prefixed by `${formatDate}, ` when `localDate(at, tz) !== localDate(at, viewerTz)`.

- [ ] **Step 4: Run the tests and see them pass in all three host zones**

Run: `npm test`
Expected: PASS three times.

- [ ] **Step 5: Commit**

```bash
git add src/shared/time.ts src/shared/time.test.ts
git commit -m "feat(time): format times with locally used zone names and city"
```

---

