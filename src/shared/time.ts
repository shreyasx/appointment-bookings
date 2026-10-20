// ponytail: Intl only; swap for Temporal.ZonedDateTime once Node and Safari ship it

const formatters = new Map<string, Intl.DateTimeFormat>();

// Slot building calls these hundreds of times per request, so formatters are built once per locale, zone and options.
function formatter(locale: string, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone }); // throws on a junk zone, before the cache is touched
    if (formatters.size > 500) formatters.clear(); // ponytail: clear-all past 500 entries; an LRU if real zones ever churn
    formatters.set(key, f);
  }
  return f;
}

// ICU accepts "IST" and maps it to India, so a zone without a "/" is only valid as "UTC" (spec §7 rule 8).
export function isValidTimeZone(tz: string): boolean {
  if (tz !== 'UTC' && !tz.includes('/')) return false;
  try {
    formatter('en-US', tz, {});
    return true;
  } catch {
    return false;
  }
}

/** UTC offset of `tz` at the instant `at`, in minutes (-240, 330). */
export function offsetMinutes(at: Date, tz: string): number {
  const name = formatter('en-US', tz, { timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  if (name === 'GMT') return 0;
  const m = name?.match(/^GMT([+\-−])(\d\d):(\d\d)$/);
  if (!m) throw new Error(`cannot read the UTC offset of ${tz}: ${name}`);
  return (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** The calendar date at `at` in `tz`, as 'YYYY-MM-DD'. */
export function localDate(at: Date, tz: string): string {
  const parts = formatter('en-US', tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function parseDate(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y!, m!, d!];
}

/** Day of the week of a calendar date, 0 = Sunday. */
export function weekdayOf(date: string): number {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The instant at which `tz` reads `date` `time` ('HH:MM' or 'HH:MM:SS').
 * Matches Temporal's 'compatible' rule: a repeated hour resolves to its first pass,
 * and a time skipped by a clock change moves forward by the gap.
 */
export function zonedTimeToInstant(date: string, time: string, tz: string): Date {
  const [y, m, d] = parseDate(date);
  const [hh, mm, ss = 0] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh!, mm!, ss); // the wall-clock reading as if it were UTC
  const early = offsetMinutes(new Date(wall - 86_400_000), tz);
  const late = offsetMinutes(new Date(wall + 86_400_000), tz);
  const valid = [early, late]
    .map((o) => wall - o * 60_000)
    .filter((t) => offsetMinutes(new Date(t), tz) * 60_000 === wall - t);
  // repeated hour: two valid instants, take the earlier; gap: none valid, move forward by the gap
  return new Date(valid.length ? Math.min(...valid) : wall - early * 60_000);
}

/** 'GMT', 'GMT+1', 'GMT+5:30', 'GMT-4' for an offset in minutes. */
export function formatOffset(minutes: number): string {
  if (minutes === 0) return 'GMT';
  const abs = Math.abs(minutes);
  const rest = abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : '';
  return `GMT${minutes < 0 ? '-' : '+'}${Math.floor(abs / 60)}${rest}`;
}

/** The name people there use for the zone at `at` ('BST', 'IST', 'EDT'), or 'GMT+9' when no English locale names it. */
export function zoneAbbreviation(at: Date, tz: string): string {
  // ponytail: six English locales cover the zones we serve; add a per-zone map if one picks a wrong name
  for (const locale of ['en-US', 'en-GB', 'en-IE', 'en-IN', 'en-CA', 'en-AU']) {
    const name = formatter(locale, tz, { timeZoneName: 'short' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    if (name && !/^(GMT|UTC)[+-]/.test(name)) return name;
  }
  return formatOffset(offsetMinutes(at, tz));
}

const CITY_ALIASES: Record<string, string> = {
  'Asia/Calcutta': 'Kolkata',
  'Europe/Kiev': 'Kyiv',
  'Asia/Saigon': 'Ho Chi Minh City',
};

export function cityName(tz: string): string {
  return CITY_ALIASES[tz] ?? tz.slice(tz.lastIndexOf('/') + 1).replaceAll('_', ' ');
}

/** ICU's own spelling of a zone, so 'Asia/Kolkata' and 'Asia/Calcutta' compare equal. */
export function canonicalTimeZone(tz: string): string {
  return formatter('en', tz, {}).resolvedOptions().timeZone;
}

/** '4:00 PM', with a plain space where ICU puts a narrow no-break one. */
export function formatTime(at: Date, tz: string): string {
  return formatter('en-US', tz, { hour: 'numeric', minute: '2-digit' }).format(at).replace(/\u202f/g, ' ');
}

/** 'Tue 27 Oct' */
export function formatDate(at: Date, tz: string): string {
  return formatter('en-GB', tz, { weekday: 'short', day: 'numeric', month: 'short' }).format(at);
}

/** 'Tue 27 Oct 2026' (en-GB would put a comma after the weekday if asked for the year too) */
export function formatDateWithYear(at: Date, tz: string): string {
  return `${formatDate(at, tz)} ${formatter('en-GB', tz, { year: 'numeric' }).format(at)}`;
}

/** A 'YYYY-MM-DD' calendar day as 'Sun 25 Oct'. */
export function formatDayKey(key: string): string {
  return formatDate(new Date(`${key}T12:00:00Z`), 'UTC');
}

/** 'BST (London)' */
export function formatZone(at: Date, tz: string): string {
  return `${zoneAbbreviation(at, tz)} (${cityName(tz)})`;
}

/** 'Tue 27 Oct, 4:00 PM BST (London)', the display style used in the UI and the emails. */
export function formatWhen(at: Date, tz: string): string {
  return `${formatDate(at, tz)}, ${formatTime(at, tz)} ${formatZone(at, tz)}`;
}

/** '4:00–5:00 PM GMT (London)'; names both zones when a clock change falls inside the span. */
export function formatSpan(start: Date, end: Date, tz: string): string {
  const from = formatTime(start, tz);
  const to = formatTime(end, tz);
  const city = cityName(tz);
  if (offsetMinutes(start, tz) !== offsetMinutes(end, tz)) {
    return `${from} ${zoneAbbreviation(start, tz)}–${to} ${zoneAbbreviation(end, tz)} (${city})`;
  }
  const samePeriod = from.slice(-2) === to.slice(-2); // 'AM' or 'PM'
  return `${samePeriod ? from.slice(0, -3) : from}–${to} ${zoneAbbreviation(start, tz)} (${city})`;
}

/** 'London (GMT+1)', the label in the zone picker. */
export function formatZoneOption(at: Date, tz: string): string {
  return `${cityName(tz)} (${formatOffset(offsetMinutes(at, tz))})`;
}

/** The time in `tz` for a reader in `viewerTz`: '9:30 PM IST', with the date when the two sides are on different days. */
export function formatOtherTime(at: Date, tz: string, viewerTz: string): string {
  const time = `${formatTime(at, tz)} ${zoneAbbreviation(at, tz)}`;
  return localDate(at, tz) === localDate(at, viewerTz) ? time : `${formatDate(at, tz)}, ${time}`;
}
