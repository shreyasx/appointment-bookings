# Final whole-branch review: ead9690..defd557

Reviewer: opus, read-only. I read the source tree at HEAD, the spec, the plan header and Task 11, readme-notes, final-parked and the ledger. I probed the live stack on :3000 with GET requests only (no bookings made). I ran two startup-failure checks on the host against dead targets (a dead DB port and a bad `DEMO_NOW`). I didn't rerun the suite: no specific doubt needed it, and the Task 14 gate ran 108 tests × 3 zones in Docker, with defd557 touching only the README and one comment.

Counts: **Critical 0 · Important 1 · Minor 6**

---

## Strengths

- **The booking transaction is the design, line for line.** In `src/server/bookings.ts:84-113`, each candidate gets its own short transaction. The isolation level is explicit (`begin isolation level read committed`, :87), the `for update` turnstile comes before both checks (:88), and the insert follows. A failed rollback can't mask the first error (:108), and a `23505` falls through to the next mentor (:109). No `pool.query` runs while a client is checked out, so the pool can't deadlock itself. pg-pool 3.14 drops broken clients on release (`!client._queryable`), so the bare `release()` is safe.
- **The backstop and the cap index match the spec exactly** (`migrations/001_init.sql:32-35`).
- **The cap race test can fail.** It uses a `beforeInsert` 100 ms pause (`src/server/bookings.test.ts:76-87`), and `README.md:295-318` records the red run with the `for update` removed. The ledger shows REPEATABLE READ was also checked to break the cap.
- **`zonedTimeToInstant` is Temporal's 'compatible' rule in about ten lines** (`src/shared/time.ts:67-78`). Both gap cases and both repeated-hour cases are pinned (`time.test.ts:18-27`).
- **`formatSpan` handles a class that straddles the change** (`time.ts:145-155`, test :64): "1:00 AM BST–1:00 AM GMT (London)".
- **The whole suite runs under three host zones** (`package.json:14`), including Los Angeles. A grep finds no local-time `Date` getters, `toLocale*`, `Date.now` or `new Date()` outside `createClock`.
- **There is one clock, end to end.** `createClock` validates an ISO instant with an offset (`app.ts:17-23`). The clock test uses 14 Oct, a date before any real run, so a route that read `new Date()` would fail (`api.test.ts:122-133`). The seed uses the same clock (`main.ts:13`).
- **Email goes out after commit and after the response.** It uses `allSettled` plus a try/catch (`app.ts:85-92`). Tests cover a never-settling mailer and a dead SMTP port (`api.test.ts:108-120`).
- **Input is validated at the edge** (`app.ts:25-32`). Names are trimmed, limited to 1–80 characters, and reject control characters and U+2028/U+2029. `startsAt` is ISO and must be on the UTC hour. Zones must be `UTC` or `Area/Location` and must pass Intl. The id is checked with `z.uuid()` before SQL (:96). All SQL is parameterised.
- **The double-submit guard holds.** It has three parts: a ref guard ahead of TanStack's deferred `isPending` (`BookingPage.tsx:30,118-128`), `busy = isPending || isSuccess` (:69), and Back locked while busy (:75). The ledger records the reason.
- **A zone change keeps the selected time on screen.** `shownDayKey` keeps the time selected across the change (`booking.ts:30-36`). `zoneOptions` dedupes canonically but keeps the current spelling, so Calcutta and Kolkata never blank the select (`booking.ts:80-103`).
- **The seed's promises are pinned in tests for three zones** (`seed.test.ts:30-44`), including London's two 1:00 AMs under the fixed clock. The seed books only through `bookSlot` (`seed.ts:85-103`).
- **Operations are careful.** Every published port binds to `127.0.0.1` (`docker-compose.yml:11,26-27,34`). The app has `init: true` (:32). The test service sits under a profile, and the runtime image has no dev dependencies. Startup failures exit with code 1. I checked this for a dead DB and for `DEMO_NOW=bogus`.
- **The README matches the code** wherever I checked: the API examples, the error table, the seed hours, the demo walkthrough (the 1:00 AM GMT → Sat 24 Oct 9:00 PM EDT example is correct), the test descriptions, the race-test line number, and the env table.
- **Every commit subject and body is lowercase** and carries no trailers.

---

## Issues

### Critical (Must Fix)

None. I found no path to a double-booked hour, a third class in a mentor's day, a time shown without its zone, an email for an uncommitted booking, or a booking lost to an email failure.

### Important (Should Fix)

**I1. A day with no bookable times reads "Full" and "Every mentor is booked on {day}."** (the known item, confirmed and sized)

- **Where:** the chip footer at `src/web/BookingPage.tsx:282`, the branch at :155, and the empty-state heading at :334. The copy comes from the plan, at `docs/superpowers/plans/2026-10-21-trial-booking.md:1425` and :1430. Those lines go back to the spec, `2026-10-20-trial-booking-design.md:445` ("A day with none says 'Full'"), which doesn't separate *no open times* from *no times at all*. So the plan and spec are at fault, not the implementer.
- **Root cause:** not `groupIntoDays` (`booking.ts:16-27`). It is correct to return all 14 days (spec §10 wants 14 chips), and each `Day` already carries `slots`. The fault is that `BookingPage` labels and branches on `openCount` alone. So `slots.length === 0` (nothing offered) and "every slot unavailable" (genuinely booked out) render the same way.
- **Live confirmation:** at `now = 2026-10-20T22:34Z` (11:34 PM BST), London's today is 0 open of 0 slots, so the chip shows "Full". Tapping it says "Every mentor is booked on Tue 20 Oct." Today's genuinely full days are 23 and 24 Oct (0/8 and 0/9).
- **Size:**
  - With the seed, every US/UK local day has some working hours, so "a day nobody works" doesn't happen in this build. "Today after the 2-hour lead" happens **every day**.
  - On weekdays, today turns "Full" from about **7 PM EDT in New York** (the last class is 9 PM EDT) and about **9 PM BST in London**. That is prime browsing time for these parents. On Sundays in New York it reads "Full" from about 6 AM, because the last Sunday class is 8 AM EDT.
  - Capacity equals demand here, and the product designed "Full" as a meaningful state, so a false "every mentor is booked" misleads the reader. Nothing is booked wrongly, which is why this is Important rather than Critical.
- **Smallest correct fix:** two ternaries, no new props or helpers.
  ```tsx
  // BookingPage.tsx:282, the chip footer
  {d.openCount ? (d.openCount === 1 ? '1 slot' : `${d.openCount} slots`) : d.slots.length ? 'Full' : 'No slots'}

  // BookingPage.tsx, inside EmptyDay (days[0] is today: groupIntoDays starts there)
  const day = days.find((d) => d.key === dayKey)!;
  <p className="font-bold">
    {day.slots.length
      ? `Every mentor is booked on ${formatDayKey(dayKey)}.`
      : dayKey === days[0]!.key ? 'No times are left today.' : `There are no times on ${formatDayKey(dayKey)}.`}
  </p>
  ```
  Keep the chip's greyed `bg-full` styling for both cases, since neither day has anything to book. Keep the "nearest days with open times" block as it is. It is exactly right for both.
- **Copy:** chip footer "No slots", which matches the chip's own "1 slot / n slots". Empty state: "No times are left today." or "There are no times on {day}." Neither claims a cause, so both stay true whether the lead time ran out or nobody works that day. Spec §10 (lines 422–537) has no copy for this case. Its only related strings are the plan's "Every mentor is booked…" and `NOTHING_OPEN`.
- **Also amend** spec :445 to: "A day whose times are all taken says 'Full'. A day with no times says 'No slots'." Amend plan :1425 and :1430 to match.
- **Test gap:** the bug lived in JSX that no test reaches. If the wave wants a check, move the three-way label into `booking.ts` (for example `dayLabel(day)`) and add one assertion to `booking.test.ts`. That's optional.

### Minor (Nice to Have)

**M1. The selected day chip and slot are barely distinguishable** (`BookingPage.tsx:278`, :316)
- **What's wrong:** a selected chip is a `brand-100` fill (#FFE9AD, about 1.2:1 against the white card) with a `brand` border (1.78:1). An unselected chip has a `field` border (3.04:1), so the selected chip actually has the *weaker* outline. A selected slot is `bg-brand` (1.78:1) plus bold text.
- **Why it matters:** WCAG 1.4.11 asks for 3:1 on state indicators. The slot grid's legend is `sr-only`, so for a sighted user the chip is the only on-screen marker of which day is shown. These colours come from the approved palette (spec §10), so this sits at the spec level.
- **Fix:** add `peer-checked:border-ink` to both class strings (about 8:1). It keeps the look and costs one class each.

**M2. Keyboard focus is lost after a 409 and misplaced after a 400** (`BookingPage.tsx:192`, :353-381, :35-39)
- **After a 409:** the focused Confirm button becomes `disabled` because `selected` is cleared. Chrome then drops focus to `body`. The alternatives sit *above* Confirm in DOM order, so Tab goes nowhere useful. The `role="alert"` still announces the problem.
- **After a 400:** the bounce back to step 1 focuses the "Your details" heading, not the invalid field.
- **Fix:** add `autoFocus` on the first alternative button, or give the alert box `tabIndex={-1}` and focus it. On the bounce back, focus the first field with an error.

**M3. Possibly stuck on "Booking…" after Back from the confirmation page** (`BookingPage.tsx:69`, `hooks.ts:36`). Unverified.
- **What could happen:** `location.assign` leaves the booking page in history with `book.isSuccess` true. A browser that restores it from the back-forward cache would show a disabled "Booking…" Confirm button and a locked Back arrow until the user reloads.
- **Where:** Chrome shouldn't restore it, because the page received `Cache-Control: no-store` fetch responses. Firefox and Safari may.
- **Fix:** check manually once in Firefox. If it reproduces, one line in `main.tsx` fixes it: `addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });`.

**M4. The email field is capped at 80 characters, while the server allows 254** (`BookingPage.tsx:234`)
- **What's wrong:** `Field` applies `maxLength={80}` to all three inputs. The plan mandated this (`plan:1417`).
- **Why it matters:** a long work address gets silently truncated on paste and then fails server validation. It's rare.
- **Fix:** pass `maxLength={254}` for `parentEmail`.

**M5. A 400 on a field the parent can't edit shows only "Some details need fixing."** (`BookingPage.tsx:185-187`)
- **What's wrong:** if `parentTimeZone` fails server validation, step 2 shows only that generic sentence, and nothing on screen is fixable. This can happen when the browser's ICU knows a zone that Node's ICU doesn't.
- **Fix:** show the field messages in that alert, or special-case the zone: "Please pick your time zone from the list."

**M6. Nothing ignores the assignment PDF** (`.gitignore`)
- **What's wrong:** `Codeyoung_Senior_Full_Stack_Engineer_Assignment (1).pdf` sits untracked in the root of a public repository. The plan forbids committing it, but nothing in git stops `git add -A` from doing so. (`.dockerignore` already excludes it.)
- **Fix:** add `*.pdf` to `.gitignore`.

---

## Parked findings (final-parked.md, line by line)

1. **Formatter cache: key normalisation and a bound test.** Leave. The 500-entry clear already caps memory. Normalising only saves a few rebuilds.
2. **Task 2:**
   - **'UTC (UTC)':** leave. Only browsers that report UTC (privacy modes) see it, and it's cosmetic.
   - **'St Johns' / 'Eastern':** leave. US/UK browsers report `America/New_York`, so these names don't reach our users.
   - **No spring-forward span test:** leave. That span takes the same differing-offset branch the fall-back test pins.
3. **Task 3:**
   - **`migrate` rollback guard:** fix. It's one line, `await client.query('rollback').catch(() => {})` at `db.ts:40`, matching `bookings.ts:108` and `seed.ts:69`. Without it, a dead connection replaces the real migration error in the startup log.
   - **The rest:** leave. Admin pool, `drop()` re-entrancy and the concurrent-migrate test concern test helpers only, and the advisory lock is the standard pattern. Key order is cosmetic.
4. **Task 4: round-up, cross-mentor uniqueness, arrayContaining.** Leave. The NY 02:30 case covers round-up, `buildSlots` dedupes by Map key, and `arrayContaining` is enough to pin both 1:00 AMs.
5. **T5-M1 client error listener.** Already done (`db.ts:13`). Nothing to do.
6. **No regression test for the rollback guard or the error listener.** Leave. They are hard to make deterministic, both are one-liners, and both were scratch-verified.
7. **Task 6:**
   - **No SMTP timeouts:** leave. Sends run after the response.
   - **`toContain` tests:** leave. They suit multi-line bodies.
   - **Dead `?? name`:** leave. Harmless.
   - **`@types/nodemailer` shadowed:** leave, and the premise is wrong: nodemailer 10.1.7 has no `types` field, so `@types/nodemailer` is still needed.
8. **T7-M5/M6/M7: root key `''`, Zod's absent-field message, non-canonical zone case, 500 between commit and re-read.** Leave. The UI never reaches any of them, and the last is a documented known limit.
9. **Corrupt gzip or bad percent-escape gives a logged 500.** Leave. I reconfirmed both live. Only hand-crafted requests reach them, and the error shape is still correct.
10. **Two app instances could both pre-book.** Leave. Compose runs one instance, and the README says so.
11. **Mentor data not pinned by a test, no `connectionTimeoutMillis`, `replace` vs `replaceAll`.** Leave. The README documents the data, the db is local, and every seed name has a single space.
12. **T9-M3: NY `dayMixesOffsets` test.** Leave. The London test pins the same code path.
13. **T10-M4: `api.ts` error mapping and retry predicate untested.** Leave. The server tests pin the error shapes. Add a stubbed-fetch test only if the wave touches `api.ts`.
14. **Task 12: card/h1 misalignment at 480–767px, no h1 while loading, `mentorDays` test gaps, `split(' ')`.** Leave all four: cosmetic or test nits.
15. **Task 13:**
   - **`USER node`:** fix. One line in the runtime stage. The app only reads files and listens on 3000.
   - **Healthcheck `wget -qO-`:** fix. Change it to `wget -qO /dev/null`, so the health log doesn't fill with slot JSON every 2 s. Optionally use `interval: 30s` with `start_interval: 2s`, so steady state isn't a slot computation every 2 s.
   - **`.dockerignore` `**/*.pdf`:** leave. The only PDF is at the root, which `*.pdf` already matches.
16. **Task 14: a day with no slots reads Full.** Fix. This is **I1**.
17. **Task 14: README says `npm test` needs mailpit.** Already fixed in defd557 (`README.md:52-58` say db only). Nothing to do.

---

## Declined to judge

- **Abuse protection:** a script could book out all 20 slots a day. Spec non-goals rule out verification and per-family limits, and the spec is silent on rate limits.
- **One family booking twice** (for example a retry after a lost 201): spec non-goal ("One free trial per family").
- **A cancelled booking would still show "You're booked!":** there is no cancel feature (non-goal), so nobody can reach this state.
- **"We've emailed this to …" shows even when the send failed:** spec §10 copy. Email is best-effort by design, and an outbox is a non-goal.
- **A selected slot that a refetch marks full stays selected, and Confirm then gets a 409:** spec §7 accepts a stale `now`, with a 409 as the worst case, and the 409 path handles it.
- **The zone pill and slots stay clickable during the sub-second in-flight request:** the plan only asks that Confirm and Back lock. The window is negligible.
- **Unknown SPA paths return HTTP 200 with the not-found card:** this follows from spec §10's SPA fallback design.
- **Static assets aren't served `immutable`:** performance tuning is outside the plan.
- **Satoshi comes from a third-party CDN:** spec §10 mandates it.
- **Whitespace-only names reach step 2 before the server rejects them:** already ruled (T11-M3).
- **The mentors page's "2 of 2" undercount on the current day:** already ruled (A-M5) and documented.
- **en-GB "Sept":** already ruled.
- **No request logging or metrics:** outside the spec.

---

## Recommendations

1. **One fix wave:**
   - I1, with the spec line 445 and plan :1425/:1430 amendments;
   - the `migrate` rollback guard;
   - `USER node` and the healthcheck `-qO /dev/null`;
   - M1, M2, M4 and M6, which are one line or one attribute each.
2. **Check M3** once in Firefox before deciding on it.
3. **M5 is optional.**
4. **If the wave adds a test, make it the day-label one** (I1), since the bug escaped exactly because that logic lived in JSX.
5. **No other plan deviations need confirmation.** Every departure I found is ruled in the ledger and listed in the README's "Where the build goes beyond the spec".

---

## Assessment

**Ready to merge? With fixes.**

The core the assignment grades hardest is correct and well proven: concurrency, time zones and DST, the clock, and email after commit. The one Important issue is user-facing copy that wrongly says "Full" every evening. It comes from the spec's own wording and has a two-line fix. The rest are small accessibility and hygiene nits.
