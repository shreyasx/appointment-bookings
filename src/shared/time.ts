// ponytail: Intl only; swap for Temporal.ZonedDateTime once Node and Safari ship it

const formatters = new Map<string, Intl.DateTimeFormat>();

// Slot building calls these hundreds of times per request, so formatters are built once per locale, zone and options.
function formatter(locale: string, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone });
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
