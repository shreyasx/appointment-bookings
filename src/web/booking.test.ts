import { expect, test } from 'vitest';
import { addDays } from '../shared/time.ts';
import type { SlotDto } from '../shared/types.ts';
import {
  clockChange, dayMixesOffsets, dayStatus, flowReducer, groupIntoDays, initialFlow, initialTimeZone, mentorDays, nearestOpenDays,
  nearestOpenTimes, sameZone, shownDayKey, zoneOptions,
} from './booking.ts';

const NOW = new Date('2026-10-20T12:00:00Z');
const slot = (startsAt: string, available = true): SlotDto => ({ startsAt, available });

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

test('dayStatus tells an open day from a fully booked one and from one with no times at all', () => {
  const slots = [slot('2026-10-20T15:00:00Z'), slot('2026-10-20T16:00:00Z', false), slot('2026-10-21T15:00:00Z', false)];
  const [open, full, none] = groupIntoDays(slots, 'Europe/London', NOW); // 20, 21 and 22 Oct
  expect([open, full, none].map((d) => dayStatus(d!))).toEqual(['open', 'full', 'none']);
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

test('nearestOpenTimes breaks a tie toward the earlier slot', () => {
  const slots = [slot('2026-10-27T15:00:00Z'), slot('2026-10-27T17:00:00Z')];
  expect(nearestOpenTimes(slots, '2026-10-27T16:00:00Z', 1)).toEqual(['2026-10-27T15:00:00Z']);
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

// the select goes blank unless one option's value is the current zone, whichever way ICU spells it or the list omits it
test('zoneOptions returns the same array for the same zone and hour, and a fresh one when either changes', () => {
  const options = zoneOptions('Europe/London', NOW);
  expect(zoneOptions('Europe/London', new Date(NOW.getTime() + 60_000))).toBe(options);
  expect(zoneOptions('Europe/London', new Date(NOW.getTime() + 3_600_000))).not.toBe(options);
  expect(zoneOptions('America/New_York', NOW).find((o) => o.value === 'America/New_York')).toBeDefined();
});

test.each(['UTC', 'Europe/Paris', 'Europe/Kiev', 'Asia/Calcutta'])('zoneOptions(%s) has one option whose value is the current zone, and no zone twice', (current) => {
  const options = zoneOptions(current, NOW);
  expect(options.filter((o) => o.value === current)).toHaveLength(1);
  const zones = options.map((o) => new Intl.DateTimeFormat('en', { timeZone: o.value }).resolvedOptions().timeZone);
  expect(new Set(zones).size).toBe(zones.length);
});

test('initialTimeZone and sameZone', () => {
  expect(initialTimeZone('Europe/London', 'America/New_York')).toBe('Europe/London');
  expect(initialTimeZone('Mars/Base', 'America/New_York')).toBe('America/New_York');
  expect(initialTimeZone(null, 'America/New_York')).toBe('America/New_York');
  expect(initialTimeZone(null, 'Mars/Base')).toBe('UTC');
  expect(sameZone('Asia/Kolkata', 'Asia/Calcutta')).toBe(true);
});

test('flowReducer keeps details through a 409 and clears the selection', () => {
  const details = { parentName: 'Asha Patel', parentEmail: 'asha@example.com', childName: 'Rohan' };
  let s = flowReducer(initialFlow, { type: 'detailsSubmitted', details });
  expect(s.step).toBe('time');
  s = flowReducer(s, { type: 'slotSelected', startsAt: '2026-10-27T16:00:00Z' });
  s = flowReducer(s, { type: 'slotUnavailable', startsAt: '2026-10-27T16:00:00Z' });
  expect(s).toMatchObject({ step: 'time', details, selected: null, unavailable: '2026-10-27T16:00:00Z' });
  expect(flowReducer(s, { type: 'slotSelected', startsAt: '2026-10-27T17:00:00Z' })).toMatchObject({ selected: '2026-10-27T17:00:00Z', unavailable: null });
  expect(flowReducer(s, { type: 'daySelected', dayKey: '2026-10-28' })).toMatchObject({ chosenDay: '2026-10-28', selected: null });
  expect(flowReducer(s, { type: 'back' })).toMatchObject({ step: 'details', details });
});

test("mentorDays groups by the mentor's own day and marks the cap", () => {
  const days = mentorDays([{ startsAt: '2026-10-27T22:00:00Z' }, { startsAt: '2026-10-27T16:00:00Z' }, { startsAt: '2026-10-28T15:00:00Z' }], 'Asia/Kolkata');
  expect(days).toEqual([
    { key: '2026-10-27', times: ['2026-10-27T16:00:00Z'], atCap: false },
    { key: '2026-10-28', times: ['2026-10-27T22:00:00Z', '2026-10-28T15:00:00Z'], atCap: true }, // 3:30 AM and 8:30 PM in Kolkata
  ]);
});
