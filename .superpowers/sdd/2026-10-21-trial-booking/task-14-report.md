# Task 14 report: README and final pass

**Status:** DONE_WITH_CONCERNS (minor; see the end)

**Commit:** `f7ec9f4 docs: add readme with dst and concurrency notes` (README.md added, docs/red-run.txt removed; lowercase, no trailer)

## What I implemented

`README.md`, with the spec §15 sections in order:
1. What it is
2. Quick start
3. Seeing the clock changes live
4. Tests
5. Configuration
6. API reference
7. How bookings stay correct, including "How we know the race test bites"
8. Time zones and DST
9. Assumptions and trade-offs
10. Project layout
11. How to reset

The brief's verbatim wording is all present, checked with `grep -F` (1 hit each):
- the cap rule;
- the missing-hour sentence;
- the Ireland clause;
- `docker compose down -v`, then `DEMO_NOW=2026-10-20T12:00:00Z docker compose up`;
- "starts again from `DEMO_NOW` whenever the app restarts";
- the three-zone tests sentence;
- `docker compose run --rm --build test`.

Everything in `readme-notes.md` appears in the README:
- the six items where the build goes beyond the spec;
- the operations notes: `127.0.0.1` ports, fresh demo and reset, why tests need `--build`, the demo clock restarting;
- the three known limits;
- the four `ponytail:` notes, with Temporal as the upgrade path.

### Accuracy checks against the code
- **Routes, error shape and codes, validation rules:** checked against `src/server/app.ts`.
- **Configuration:** env defaults from `src/server/main.ts`; compose values and ports from `docker-compose.yml`.
- **DST table and examples:** I re-derived them with `src/shared/time.ts` in Node, and they match the README:
  - 8:30 PM in Kolkata reads 4:00 PM BST / 11:00 AM EDT / 8:00 AM MST on Fri 23 Oct; 3:00 PM GMT / 11:00 AM EDT / 8:00 AM MST on Tue 27 Oct; 3:00 PM GMT / 10:00 AM EST / 8:00 AM MST on Tue 3 Nov.
  - Both repeated 1:00 AMs, in London and in New York.
  - The Los Angeles Monday that falls on the Kolkata Tuesday.
  - Dublin: 0/GMT in winter and 60/IST in summer.
  - The span "1:00 AM BST–1:00 AM GMT (London)".
- **Missing-hour sentence:** matches `time.test.ts`, where 2:00 gives 07:00Z (3:00 EDT) and 2:30 gives 07:30Z (3:30 EDT). The "two classes in 2:00–5:00" and "three classes in 1:00–3:00" claims match `slots.test.ts`.
- **Race-test quote:** `src/server/bookings.test.ts` line 84 is still `expect(results.filter((r) => r.ok)).toHaveLength(1);`, and lines 82–86 match the quote. The quote is copied verbatim from `docs/red-run.txt`. That file is then removed with `git rm` in the same commit.
- **API examples:** each one ran against the stack on `DEMO_NOW=2026-10-20T12:00:00Z` with a fresh seed. The README shows the real output, pretty-printed and trimmed. Names are made up and the email is `sarah@example.com`.
  - `GET /api/slots`: 200, including the seeded full hour `2026-10-26T16:00Z` with `available: false`.
  - `POST /api/bookings`: 201.
  - The same body for `2026-10-26T16:00Z`: 409 `SLOT_UNAVAILABLE`.
  - A bad body: 400 `VALIDATION_FAILED` with four `fields`.
  - `GET /api/bookings/:id`: 200, and 404 `NOT_FOUND` for an unknown id.
  - `GET /api/mentors`: 200.
  - Mailpit received both emails for that API booking.
- **Host run:** I checked the README's "run the server on the host" line by running `npm run build`, then `PORT=3100 npm start`. `/api/slots` and `/mentors` answered. I then stopped that process by the PID that `lsof` showed on port 3100.
- **Wording:** "IST" appears only in display strings ("9:30 PM IST (Kolkata)") and in the discussion of abbreviations. The rule itself always says "the mentor's own time zone", and prose says "in Kolkata".
- **Leaks:** no `TRANSCRIPT.md`, no machine paths, and no secrets beyond `bookings`/`bookings`.

## Tests and verification

`npm run typecheck && docker compose down -v && docker compose up --build -d --wait && docker compose run --rm --build test` exited 0:
```
> tsc
...
> TZ=UTC vitest run && TZ=Pacific/Chatham vitest run && TZ=America/Los_Angeles vitest run
 Test Files  8 passed (8)
      Tests  108 passed (108)
 Test Files  8 passed (8)
      Tests  108 passed (108)
 Test Files  8 passed (8)
      Tests  108 passed (108)
EXIT=0
```
The test output contains no stderr or warning lines.

### Click-through with Playwright

Screenshots are in `.playwright-mcp/task-14-shots/`.

**Real clock** (`real-01` to `real-05`):
- `/`: entered details, switched the zone from the device's Kolkata to London, and picked Wed 21 Oct 4:00 PM BST. The button read "Confirm Wed 21 Oct, 4:00 PM BST".
- Confirmation `/bookings/f9cd2618-…`: "Wed 21 Oct 2026, 4:00–5:00 PM BST (London)" and "Your mentor joins from Kolkata, where it's 8:30 PM IST." The mentor was Priya Sharma.
- Mailpit had exactly 2 messages:
  - to `hannah@example.com`: "Oscar's free trial class: Wed 21 Oct, 4:00 PM BST (London)";
  - to `priya.sharma@mentors.example`: "New trial class: Wed 21 Oct, 8:30 PM IST (Kolkata)".
- `/mentors`: the new booking is listed, with "2 of 2 that day" badges and no demo banner.

**Demo clock** (`docker compose down -v && DEMO_NOW=2026-10-20T12:00:00Z docker compose up -d --wait`; `demo-01` to `demo-04`):
- The banner read "Demo clock: it's Tue 20 Oct 2026, 1:00 PM in London".
- Sun 25 Oct in London:
  - the notice read "Clocks in London change on Sun 25 Oct. Times from then on are GMT, not BST. On this day each time shows its zone.";
  - the times were 12:00 AM BST, 1:00 AM BST, 1:00 AM GMT, then 9:00 AM–12:00 PM GMT.
- Picked 1:00 AM GMT, then switched to New York. The time stayed selected under Sat 24 Oct ("Confirm Sat 24 Oct, 9:00 PM EDT"). On Sun 1 Nov the notice read "Clocks in New York change on Sun 1 Nov. Times from then on are EST, not EDT."
- Back in London, booked Sun 25 Oct 1:00 AM GMT. The confirmation showed "1:00–2:00 AM GMT (London)", and the mentor was Sneha Kulkarni ("6:30 AM IST").
- Mailpit had exactly 2 messages:
  - to `daniel@example.com`: "Freya's free trial class: Sun 25 Oct, 1:00 AM GMT (London)";
  - to `sneha.kulkarni@mentors.example`: "New trial class: Sun 25 Oct, 6:30 AM IST (Kolkata)".
- `/mentors`: the banner showed, and the new 6:30 AM booking was listed under Sneha.

These UI observations led me to correct two README bullets:
- the London notice only shows from the change day onwards;
- in New York, a selected 1:00 AM GMT shows as Sat 24 Oct 9:00 PM EDT.

**End state:** `docker compose down -v && docker compose up -d --wait`. The stack is running on the real clock (`demo: false`) with a fresh database. The browser is closed, and no background shells are left.

## TDD evidence

This task changes documentation only, so it has no RED/GREEN cycle. The README quotes the RED evidence for the lock (`docs/red-run.txt`, the cap race test with `for update` removed). Today's GREEN is the three-zone run above.

## Files changed
- `README.md` (new)
- `docs/red-run.txt` (deleted)

Not committed, as the rules require:
- `.playwright-mcp/` (screenshots);
- `dist/web` (built locally to check `npm start`; it is gitignored).

## Self-review and concerns
- **Minor, existing UI behaviour; not changed.** Late in the London evening on the real clock, the first day chip, "Tue 20 Oct", reads "Full". In fact it has no hours left, because all of them fall inside the 2-hour lead. The day list always starts today (Task 10's design). "No times left" would be more accurate than "Full". Flagging it for the author, not fixing it, because it's outside this task.
- **Minor.** Following the brief, the README says `npm test` needs `db` and `mailpit` up. No test actually talks to Mailpit: the tests use an in-memory mailer, and a closed port for the failing-mailer test. The wording is harmless, but `db` alone is enough.
- The brief file's Step 2 says "both test runs"; the plan and the dispatch say three. All three passed.
- The API example outputs came from the demo-clock stack that was running before Step 2. The seed is the same: same `DEMO_NOW`, fresh database. Booking ids, class links and `now` values are random or depend on the run, and the README says so.

---

# Fix round 1

**Commit:** `defd557 docs: fix the bst example, tests need only the db, and trim the readme`. It sits on top of the controller's `b5f4edf`, has no trailer, and adds `README.md` and `src/shared/time.ts` by name.

## What changed
1. **Wrong BST example (README, Time zones and DST).**
   - The display-style example now reads "Fri 23 Oct, 4:00 PM BST (London)".
   - The old bullet is split in two: "One display style everywhere" and "The abbreviation is the name people use there".
2. **`src/shared/time.ts:140`.** The `formatWhen` doc comment now reads `'Fri 23 Oct, 4:00 PM BST (London)'`. Only the comment changed.
3. **Tests need only `db`.** The README now says "with `db` up" and `docker compose up -d db`.
4. **Trims.**
   - Quick start: dropped the reset pointer. Moved the `127.0.0.1` port-binding note to the end of Configuration. The seed line now reads "The seed pre-books a fully booked day and a full hour, so those states show at once."
   - Demo clock: dropped the duplicate command block. The verbatim inline sentence stays.
   - Beyond-the-spec list: the three-zone bullet is now "The suite runs under three host zones, not two (see Tests)."
   - Project layout: dropped the 8 test-file lines. In their place, one sentence after the tree says each `*.test.ts` sits beside its module and points to Tests.
   - Mentor bio in the POST and mentors examples: replaced with `"bio": "…"`.
5. **Accuracy.**
   - "in one place" now reads "in one function" (`zonedTimeToInstant`).
   - The 409 row in the error table now says "outside the booking window (2 hours to 14 days ahead) or nobody is free".
   - `bookSlot` step 1 now names the window as "(2 hours to 14 days ahead)".
   - `parentTimeZone` now mentions "at most 64 characters".

I left the "Full" label on a day with no hours as it is, as instructed.

## Commands and output
```
$ npm run typecheck
> tsc
(exit 0, no output)

$ npx vitest run src/shared/time.test.ts
 Test Files  1 passed (1)
      Tests  46 passed (46)
```

## Checks
I re-grepped the verbatim strings in `README.md`. Each appears exactly once:
- the cap rule;
- the missing-hour sentence;
- the Ireland clause;
- `docker compose down -v`, then `DEMO_NOW=2026-10-20T12:00:00Z docker compose up`;
- "starts again from `DEMO_NOW` whenever the app restarts";
- the three-zone sentence;
- `docker compose run --rm --build test`;
- "with `db` up";
- "How we know the race test bites".

Other checks:
- "Tue 27 Oct, 4:00 PM BST" no longer appears in `README.md` or `src/`.
- The red-run quote is still byte-identical to the original `docs/red-run.txt`, checked by substring match against `f7ec9f4^`.
- I didn't rebuild Docker, as instructed.
