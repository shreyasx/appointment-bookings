import { expect, test } from 'vitest';
import {
  addDays,
  canonicalTimeZone,
  cityName,
  formatDateWithYear,
  formatDayKey,
  formatOffset,
  formatOtherTime,
  formatSpan,
  formatTime,
  formatWhen,
  formatZoneOption,
  isValidTimeZone,
  localDate,
  offsetMinutes,
  weekdayOf,
  zoneAbbreviation,
  zonedTimeToInstant,
} from './time.ts';

test.each([
  ['America/New_York', '2026-01-15T12:00:00Z', -300],
  ['America/New_York', '2026-07-15T12:00:00Z', -240],
  ['America/Phoenix', '2026-01-15T12:00:00Z', -420],
  ['America/Phoenix', '2026-07-15T12:00:00Z', -420],
  ['Europe/London', '2026-01-15T12:00:00Z', 0],
  ['Europe/London', '2026-07-15T12:00:00Z', 60],
  ['Europe/Dublin', '2026-01-15T12:00:00Z', 0],
  ['Europe/Dublin', '2026-07-15T12:00:00Z', 60],
  ['Asia/Kolkata', '2026-01-15T12:00:00Z', 330],
  ['Asia/Kathmandu', '2026-07-15T12:00:00Z', 345],
])('offsetMinutes(%s, %s) is %i', (tz, at, minutes) => {
  expect(offsetMinutes(new Date(at), tz)).toBe(minutes);
});

test.each([
  ['2026-10-27', '20:30', 'Asia/Kolkata', '2026-10-27T15:00:00.000Z'],
  ['2026-03-08', '02:00', 'America/New_York', '2026-03-08T07:00:00.000Z'], // gap: 2:00 becomes 3:00 EDT
  ['2026-03-08', '02:30', 'America/New_York', '2026-03-08T07:30:00.000Z'], // gap: 2:30 becomes 3:30 EDT
  ['2026-03-29', '01:30', 'Europe/London', '2026-03-29T01:30:00.000Z'], // gap: 1:30 becomes 2:30 BST
  ['2026-11-01', '01:30', 'America/New_York', '2026-11-01T05:30:00.000Z'], // repeated hour: first (EDT)
  ['2026-10-25', '01:30', 'Europe/London', '2026-10-25T00:30:00.000Z'], // repeated hour: first (BST)
])('zonedTimeToInstant(%s %s, %s) is %s', (date, time, tz, expected) => {
  expect(zonedTimeToInstant(date, time, tz).toISOString()).toBe(expected);
});

test('one instant falls on different calendar days', () => {
  const at = new Date('2026-10-27T01:00:00Z'); // Mon 6:00 PM in Los Angeles
  expect(localDate(at, 'America/Los_Angeles')).toBe('2026-10-26');
  expect(localDate(at, 'Asia/Kolkata')).toBe('2026-10-27');
});

test('calendar helpers', () => {
  expect([weekdayOf('2026-10-25'), weekdayOf('2026-10-27')]).toEqual([0, 2]);
  expect([addDays('2026-10-31', 1), addDays('2026-11-01', -1)]).toEqual([
    '2026-11-01',
    '2026-10-31',
  ]);
});

test.each(['Asia/Kolkata', 'Asia/Calcutta', 'Europe/Dublin', 'UTC', 'US/Eastern'])(
  'accepts %s',
  (tz) => {
    expect(isValidTimeZone(tz)).toBe(true);
  },
);
test.each(['IST', 'EST', 'GMT', 'Mars/Olympus', '', 'GMT+5:30x'])('rejects %j', (tz) => {
  expect(isValidTimeZone(tz)).toBe(false);
});

test.each([
  ['2026-10-27T16:00:00Z', 'Europe/London', 'Tue 27 Oct, 4:00 PM GMT (London)'],
  ['2026-10-23T15:00:00Z', 'Europe/London', 'Fri 23 Oct, 4:00 PM BST (London)'],
  ['2026-10-27T16:00:00Z', 'Asia/Kolkata', 'Tue 27 Oct, 9:30 PM IST (Kolkata)'],
  ['2026-10-27T16:00:00Z', 'Asia/Calcutta', 'Tue 27 Oct, 9:30 PM IST (Kolkata)'],
  ['2026-11-03T15:00:00Z', 'America/New_York', 'Tue 3 Nov, 10:00 AM EST (New York)'],
])('formatWhen(%s, %s)', (at, tz, expected) => expect(formatWhen(new Date(at), tz)).toBe(expected));

test.each([
  ['2026-07-15T12:00:00Z', 'Europe/Dublin', 'IST'],
  ['2026-01-15T12:00:00Z', 'Europe/Dublin', 'GMT'],
  ['2026-01-15T12:00:00Z', 'America/Phoenix', 'MST'],
  ['2026-07-15T12:00:00Z', 'America/Phoenix', 'MST'],
  ['2026-07-15T12:00:00Z', 'America/New_York', 'EDT'],
  ['2026-07-15T12:00:00Z', 'Asia/Tokyo', 'GMT+9'],
])('zoneAbbreviation(%s, %s) is %s', (at, tz, expected) =>
  expect(zoneAbbreviation(new Date(at), tz)).toBe(expected),
);

test.each([
  ['2026-10-27T16:00:00Z', '2026-10-27T17:00:00Z', 'Europe/London', '4:00–5:00 PM GMT (London)'],
  [
    '2026-10-27T11:00:00Z',
    '2026-10-27T12:00:00Z',
    'Europe/London',
    '11:00 AM–12:00 PM GMT (London)',
  ],
  [
    '2026-10-25T00:00:00Z',
    '2026-10-25T01:00:00Z',
    'Europe/London',
    '1:00 AM BST–1:00 AM GMT (London)',
  ],
  ['2026-10-27T16:00:00Z', '2026-10-27T17:00:00Z', 'Asia/Kolkata', '9:30–10:30 PM IST (Kolkata)'],
])('formatSpan(%s, %s, %s)', (start, end, tz, expected) => {
  expect(formatSpan(new Date(start), new Date(end), tz)).toBe(expected);
});

test('dates, cities, offsets and picker labels', () => {
  expect(formatDateWithYear(new Date('2026-10-27T16:00:00Z'), 'Europe/London')).toBe(
    'Tue 27 Oct 2026',
  );
  expect(formatDayKey('2026-10-25')).toBe('Sun 25 Oct');
  expect(
    ['America/New_York', 'America/Indiana/Indianapolis', 'Asia/Calcutta', 'Europe/Kiev', 'UTC'].map(
      cityName,
    ),
  ).toEqual(['New York', 'Indianapolis', 'Kolkata', 'Kyiv', 'UTC']);
  expect([0, 60, 330, -240, 345].map(formatOffset)).toEqual([
    'GMT',
    'GMT+1',
    'GMT+5:30',
    'GMT-4',
    'GMT+5:45',
  ]);
  expect(formatZoneOption(new Date('2026-07-15T12:00:00Z'), 'Europe/London')).toBe(
    'London (GMT+1)',
  );
  expect(formatZoneOption(new Date('2026-01-15T12:00:00Z'), 'Europe/London')).toBe('London (GMT)');
  expect(formatZoneOption(new Date('2026-07-15T12:00:00Z'), 'Asia/Kolkata')).toBe(
    'Kolkata (GMT+5:30)',
  );
  expect(canonicalTimeZone('Asia/Kolkata')).toBe(canonicalTimeZone('Asia/Calcutta'));
  expect(formatTime(new Date('2026-10-27T16:00:00Z'), 'Europe/London')).not.toMatch(/\u202f/);
});

test("the other side's time carries its date when the two sides are on different days", () => {
  const usEvening = new Date('2026-10-26T21:00:00Z'); // Mon 5:00 PM in New York = Tue 2:30 AM in Kolkata
  expect(formatOtherTime(new Date('2026-10-27T16:00:00Z'), 'Asia/Kolkata', 'Europe/London')).toBe(
    '9:30 PM IST',
  );
  expect(formatOtherTime(usEvening, 'Asia/Kolkata', 'America/New_York')).toBe(
    'Tue 27 Oct, 2:30 AM IST',
  );
  expect(formatOtherTime(usEvening, 'America/New_York', 'Asia/Kolkata')).toBe(
    'Mon 26 Oct, 5:00 PM EDT',
  );
});
