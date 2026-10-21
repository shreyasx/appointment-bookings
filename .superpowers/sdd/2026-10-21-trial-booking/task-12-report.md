# Task 12 report: mentors page

Status: DONE
Commit: `3454100 feat(web): add the mentors showcase with booked times in each mentor's own zone` (no trailer, all lowercase, files added by name).

## What was implemented

- `src/web/booking.ts`: `mentorDays(bookings, tz)` and the `MentorDay` type. It sorts a copy of the bookings by instant (`getTime`), groups them by `localDate(new Date(startsAt), tz)` in insertion order, and sets `atCap = times.length >= 2`. `times` are the input strings, untouched (the API's `.000Z` strings pass through as-is).
- `src/web/MentorsPage.tsx` (new):
  - `useQuery({ queryKey: ['mentors'], queryFn: getMentors })`, `useTimeZone()` for the demo banner.
  - Loading: `Card` with `role="status"` "Loading our mentors…". Error: `role="alert"` "We couldn't load our mentors. Please refresh the page to try again." (same pattern as `ConfirmationPage`).
  - `DemoBanner` when `data.demo`. `h1` "Our mentors". `ul` grid, `grid-cols-1 md:grid-cols-2`, each `li` a flex wrapper so cards in a row share a height.
  - Card (reuses `Card` and `Avatar`): avatar, name (`h2`), "Teaches from {cityName} · {zoneAbbreviation(now, tz)}", subject chips, bio, then an `h3` "Booked trial classes, in {first name}'s time". Each day is an `li` listing its times as "{formatDayKey(key)} · {formatTime} {abbr}" (abbr per time, from the mentor's zone), with a "2 of 2 that day" badge on a cap day. No bookings: "No trial classes booked yet."
  - Footer: "Times only, no parent or child names."
  - Tokens only (`brand-100`, `full`, `ink-soft`, `alert`, `rounded-field`), no raw hex, no `useMemo`/`useCallback`/`useEffect`, no "IST" in code or comments (grep checked).
- `src/web/App.tsx`: `/mentors` -> `MentorsPage`; the path switch is now a multi-line ternary.
- `src/web/booking.test.ts`: the brief's test appended verbatim, and `mentorDays` added to the import.

## TDD evidence

RED: `npx vitest run src/web/booking.test.ts -t mentorDays` ->
```
FAIL  src/web/booking.test.ts > mentorDays groups by the mentor's own day and marks the cap
TypeError: mentorDays is not a function
Tests  1 failed | 17 skipped (18)
```
Expected: the test was written before the function existed.

GREEN: same command after implementing ->
```
Test Files  1 passed (1)
Tests  1 passed | 17 skipped (18)
```

## Verification

- `npm test` (UTC, Pacific/Chatham, America/Los_Angeles): 3 x "8 files, 108 tests passed". Output was clean (filtered for fail/error/warn, nothing).
- `npm run typecheck`: exit 0, no output.
- `npm run build`: exit 0 (`dist/web/assets/index-BuzBG2Sb.js` 278.47 kB).

## Browser check (Playwright, allowed, nothing denied)

Setup as in the brief: `docker compose down -v && docker compose up -d db mailpit`, then `DEMO_NOW=2026-10-20T12:00:00Z npm run dev:server` and `npm run dev`, both with `run_in_background`. Page: `http://localhost:5173/mentors`.

- 10 cards; 24 "2 of 2 that day" badges (the seed fills most mentors' first days); the first card reads "Teaches from Kolkata · IST", "Thu 22 Oct · 8:30 PM IST" and "Thu 22 Oct · 9:30 PM IST" with the badge, and "Mon 26 Oct · 9:30 PM IST" with none. Night-shift mentors list "Fri 23 Oct · 2:30 AM IST", i.e. the mentor's own day, not the UTC day.
- Demo banner reads "Demo clock: it's Tue 20 Oct 2026, 8:00 AM in New York" (the browser's zone); footer text present.
- 1100px: 2 columns, equal-height cards per row, no horizontal scroll.
- 375px: 1 column (343px cards), `scrollWidth` 375 = viewport, badges don't wrap, no console warnings or errors.
- Screenshots (gitignored): `.playwright-mcp/task-12-shots/mentors-desktop.png`, `mentors-mobile.png`, `mentors-mobile-top.png`.
- Not exercised in the browser: the "No trial classes booked yet." branch, since every seeded mentor has bookings.

## Process cleanup

Read from `lsof -nP -iTCP:<port> -sTCP:LISTEN` right after starting: 11240 (port 3000) and 11273 (port 5173). I killed those two. Vite exited with the signal. `node --watch` (the parent of 11240) stayed alive, so I stopped its harness task `b9h9kboty` with TaskStop; a final `lsof` and `ps` show no listeners on 3000/5173 and no `node --watch`/vite/sleep strays. Docker `db` and `mailpit` are left running (they were up before). The DB was reset by `down -v` and reseeded by the dev server at the demo clock.

## Self-review

- Completeness: every line of the brief's page spec is present; `mentorDays` signature matches the interface.
- YAGNI: no extra helpers, one new type. `Card` and `Avatar` reused. The badge text is literal "2 of 2 that day" while `atCap` is `>= 2`; the cap is a fixed domain value of 2, so a constant would add nothing.
- The ruled behaviour stands: the badge counts the upcoming bookings the API returns, and a same-day class that already happened is not counted. Not worked around.
- `mentorDays` orders days by instant, which gives key order for any zone without a clock change at midnight. The mentors are all in India, where there are none, so no extra key sort was added.
- First name is `name.split(' ')[0]`; fine for the 10 seeded names (no titles or single-word names).

## Files changed

- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/src/web/MentorsPage.tsx` (new)
- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/src/web/App.tsx`
- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/src/web/booking.ts`
- `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings/src/web/booking.test.ts`

## Concerns

None blocking.
