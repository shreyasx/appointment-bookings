// Pure booking logic for the browser: no React, no DOM, and no clock. Every day key comes from time.ts,
// because a UTC-midnight Date read with a local getter lands on the wrong day in the US.
import {
  addDays, canonicalTimeZone, formatZoneOption, isValidTimeZone, localDate, offsetMinutes, zoneAbbreviation,
  zonedTimeToInstant,
} from '../shared/time.ts';
import type { SlotDto } from '../shared/types.ts';

export const DAYS_SHOWN = 14;
export const COMMON_ZONES = ['America/Los_Angeles', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/New_York',
  'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Dublin', 'Asia/Kolkata'];

export type Day = { key: string; slots: SlotDto[]; openCount: number };

/** Exactly 14 local days from today in `tz`, each holding the slots that start on it. */
export function groupIntoDays(slots: SlotDto[], tz: string, now: Date): Day[] {
  const today = localDate(now, tz);
  const days: Day[] = Array.from({ length: DAYS_SHOWN }, (_, i) => ({ key: addDays(today, i), slots: [], openCount: 0 }));
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const s of slots) {
    const day = byKey.get(localDate(new Date(s.startsAt), tz));
    if (!day) continue;
    day.slots.push(s);
    if (s.available) day.openCount++;
  }
  return days;
}

/** The day to show: the selected time's own day (it must stay on screen after a zone change), else the chosen day, else the first open one. */
export function shownDayKey(days: Day[], selected: string | null, chosenDay: string | null, tz: string): string {
  const has = (key: string) => days.some((d) => d.key === key);
  const selectedDay = selected && localDate(new Date(selected), tz);
  if (selectedDay && has(selectedDay)) return selectedDay;
  if (chosenDay && has(chosenDay)) return chosenDay;
  return (days.find((d) => d.openCount > 0) ?? days[0])!.key;
}

/** The open times closest to `target` (never `target` itself), in time order. */
export function nearestOpenTimes(slots: SlotDto[], target: string, count = 3): string[] {
  const at = new Date(target).getTime();
  return slots
    .filter((s) => s.available && new Date(s.startsAt).getTime() !== at)
    .map((s) => ({ startsAt: s.startsAt, t: new Date(s.startsAt).getTime() }))
    .sort((a, b) => Math.abs(a.t - at) - Math.abs(b.t - at) || a.t - b.t)
    .slice(0, count)
    .sort((a, b) => a.t - b.t)
    .map((s) => s.startsAt);
}

/** The closest days with an open time before and after `key`. */
export function nearestOpenDays(days: Day[], key: string): { before: Day | null; after: Day | null } {
  const open = days.filter((d) => d.openCount > 0);
  return { before: open.findLast((d) => d.key < key) ?? null, after: open.find((d) => d.key > key) ?? null };
}

/** The first day in the window whose midday offset differs from today's, with the zone names either side. */
export function clockChange(days: Day[], tz: string, now: Date): { dayKey: string; from: string; to: string } | null {
  const offset = offsetMinutes(now, tz);
  for (const { key } of days) {
    const noon = zonedTimeToInstant(key, '12:00', tz);
    if (offsetMinutes(noon, tz) !== offset) return { dayKey: key, from: zoneAbbreviation(now, tz), to: zoneAbbreviation(noon, tz) };
  }
  return null;
}

/** True on the day a clock change falls inside, where one day's times carry two zone names. */
export function dayMixesOffsets(day: Day, tz: string): boolean {
  return new Set(day.slots.map((s) => offsetMinutes(new Date(s.startsAt), tz))).size > 1;
}

export function sameZone(a: string, b: string): boolean {
  return canonicalTimeZone(a) === canonicalTimeZone(b);
}

type ZoneOption = { value: string; label: string; group: 'common' | 'all' };

// ponytail: one-entry cache keyed by zone and UTC hour; zoneOptions builds ~840 formatters (~30 ms) and the page re-renders on every state change
let last: { key: string; options: ZoneOption[] } | undefined;

/** One option per real zone, common zones first. The option for `current` carries `current`'s own spelling, or the select shows nothing. */
export function zoneOptions(current: string, now: Date): ZoneOption[] {
  const key = `${current}|${Math.floor(now.getTime() / 3_600_000)}`; // the hour keeps offset labels fresh across a clock change
  if (last?.key !== key) last = { key, options: buildZoneOptions(current, now) };
  return last.options;
}

function buildZoneOptions(current: string, now: Date): ZoneOption[] {
  const currentZone = canonicalTimeZone(current);
  const seen = new Set<string>();
  const options: ZoneOption[] = [];
  const add = (tz: string, group: 'common' | 'all') => {
    const zone = canonicalTimeZone(tz);
    if (seen.has(zone)) return; // 'Asia/Kolkata' and 'Asia/Calcutta' are one zone
    seen.add(zone);
    const value = zone === currentZone ? current : tz;
    options.push({ value, label: formatZoneOption(now, value), group });
  };
  for (const tz of COMMON_ZONES) add(tz, 'common');
  for (const tz of Intl.supportedValuesOf('timeZone')) add(tz, 'all');
  // ICU's list lacks 'UTC' (a US browser behind UTC reports it), and can lack the exact zone a device reports
  if (!seen.has(currentZone)) options.unshift({ value: current, label: formatZoneOption(now, current), group: 'common' });
  return options;
}

export type MentorDay = { key: string; times: string[]; atCap: boolean };

/** A mentor's booked times grouped into the mentor's own days, in time order. `times` are the input strings, untouched. */
export function mentorDays(bookings: { startsAt: string }[], tz: string): MentorDay[] {
  const days = new Map<string, MentorDay>();
  for (const { startsAt } of [...bookings].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())) {
    const key = localDate(new Date(startsAt), tz);
    const day = days.get(key) ?? { key, times: [], atCap: false };
    day.times.push(startsAt);
    day.atCap = day.times.length >= 2;
    days.set(key, day);
  }
  return [...days.values()];
}

/** The stored zone when it is still a real one, else the device's, else UTC, so a junk zone never reaches the Intl calls below. */
export function initialTimeZone(stored: string | null, device: string): string {
  if (stored && isValidTimeZone(stored)) return stored;
  return isValidTimeZone(device) ? device : 'UTC';
}

export type Details = { parentName: string; parentEmail: string; childName: string };
export type FlowState = {
  step: 'details' | 'time'; details: Details; chosenDay: string | null; selected: string | null; unavailable: string | null;
};
export type FlowAction =
  | { type: 'detailsSubmitted'; details: Details } | { type: 'back' } | { type: 'daySelected'; dayKey: string }
  | { type: 'slotSelected'; startsAt: string } | { type: 'slotUnavailable'; startsAt: string };

export const initialFlow: FlowState = {
  step: 'details', details: { parentName: '', parentEmail: '', childName: '' }, chosenDay: null, selected: null, unavailable: null,
};

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'detailsSubmitted': return { ...state, step: 'time', details: action.details };
    case 'back': return { ...state, step: 'details' };
    case 'daySelected': return { ...state, chosenDay: action.dayKey, selected: null };
    case 'slotSelected': return { ...state, selected: action.startsAt, unavailable: null };
    case 'slotUnavailable': return { ...state, selected: null, unavailable: action.startsAt };
  }
}
