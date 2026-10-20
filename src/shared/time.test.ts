import { expect, test } from 'vitest';
import { addDays, isValidTimeZone, localDate, offsetMinutes, weekdayOf, zonedTimeToInstant } from './time.ts';

test.each([
  ['America/New_York', '2026-01-15T12:00:00Z', -300], ['America/New_York', '2026-07-15T12:00:00Z', -240],
  ['America/Phoenix', '2026-01-15T12:00:00Z', -420], ['America/Phoenix', '2026-07-15T12:00:00Z', -420],
  ['Europe/London', '2026-01-15T12:00:00Z', 0], ['Europe/London', '2026-07-15T12:00:00Z', 60],
  ['Europe/Dublin', '2026-01-15T12:00:00Z', 0], ['Europe/Dublin', '2026-07-15T12:00:00Z', 60],
  ['Asia/Kolkata', '2026-01-15T12:00:00Z', 330], ['Asia/Kathmandu', '2026-07-15T12:00:00Z', 345],
])('offsetMinutes(%s, %s) is %i', (tz, at, minutes) => {
  expect(offsetMinutes(new Date(at), tz)).toBe(minutes);
});

test.each([
  ['2026-10-27', '20:30', 'Asia/Kolkata', '2026-10-27T15:00:00.000Z'],
  ['2026-03-08', '02:00', 'America/New_York', '2026-03-08T07:00:00.000Z'], // gap: 2:00 becomes 3:00 EDT
  ['2026-03-08', '02:30', 'America/New_York', '2026-03-08T07:30:00.000Z'], // gap: 2:30 becomes 3:30 EDT
  ['2026-03-29', '01:30', 'Europe/London', '2026-03-29T01:30:00.000Z'],    // gap: 1:30 becomes 2:30 BST
  ['2026-11-01', '01:30', 'America/New_York', '2026-11-01T05:30:00.000Z'], // repeated hour: first (EDT)
  ['2026-10-25', '01:30', 'Europe/London', '2026-10-25T00:30:00.000Z'],    // repeated hour: first (BST)
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
  expect([addDays('2026-10-31', 1), addDays('2026-11-01', -1)]).toEqual(['2026-11-01', '2026-10-31']);
});

test.each(['Asia/Kolkata', 'Asia/Calcutta', 'Europe/Dublin', 'UTC', 'US/Eastern'])('accepts %s', (tz) => {
  expect(isValidTimeZone(tz)).toBe(true);
});
test.each(['IST', 'EST', 'GMT', 'Mars/Olympus', '', 'GMT+5:30x'])('rejects %j', (tz) => {
  expect(isValidTimeZone(tz)).toBe(false);
});
