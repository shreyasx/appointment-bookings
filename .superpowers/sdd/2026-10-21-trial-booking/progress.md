# SDD ledger — plan: docs/superpowers/plans/2026-10-21-trial-booking.md

Spec: docs/superpowers/specs/2026-10-20-trial-booking-design.md (reachable; binding authority)

## Pre-execution
- user: TRANSCRIPT.md is out of scope; the author adds it at the end. Plan task 14 and file map edited; spec §15 note added.
- plan review round: two reviewers dispatched (a: correctness vs spec, b: executability/toolchain); reports in plan-review-a.md and plan-review-b.md.
- user: no co-authored-by trailer in commits. Plan global constraints and all 15 commit steps edited.
- user: "do the Before you start part of plan. no branch, work in main" — explicit consent to implement on main. Plan step 3 edited.
- before-you-start done: c8c47ff docs: add trial booking design and implementation plan (.gitignore + spec + plan). pdf left untracked.

## Plan review rulings (reports: plan-review-a.md, plan-review-b.md)
- Ruling: A-I1 / B-I3 accepted, A's version — api test 'the app clock drives slots, booking and the mentors list' with a clock at 2026-10-14T13:30Z (before any real run), so a route reading new Date() fails forever; also pinned slots[0] to 2026-10-20T15:00Z (B's tighten) — spec §12 demo-clock bullet was untested — cost if wrong: one test rewrite.
- Ruling: A-I2 accepted as a full third run under TZ=America/Los_Angeles, not A's path-limited one — a path list rots when test files are added; db suites cost seconds — spec §7 rule 7 and §12 edited from two runs to three — cost if wrong: ~1/3 more test time.
- Ruling: A-I3 accepted — slots test 'the cap uses the mentor's own day, not the UTC day' (asserts 23Z, 00Z and 01Z all closed, so a bug keying both slots and bookings by UTC date also fails; plus next Tuesday open); bookings test moved to Mon 21:00Z London = Tue 02:30 Kolkata — cost if wrong: none, tests only.
- Ruling: A-M1 / B-M2 accepted — Confirm disabled while isPending || isSuccess; Review Focus 1 wording updated — cost if wrong: none.
- Ruling: A-M2 accepted — createClock validates with z.iso.datetime({ offset: true }); test for an offset-less value added — cost if wrong: none.
- Ruling: A-M3 accepted — the failing-mailer test uses createSmtpMailer('smtp://127.0.0.1:9') as spec §12 says; Task 7 consumes createSmtpMailer — cost if wrong: a flaky test if a host listens on port 9.
- Ruling: A-M4 accepted — loadActiveBookings length 2 after the cancel test (fresh db per test) — cost if wrong: none.
- Ruling: A-M5 rejected — keep /api/mentors as upcoming-only bookings; spec §6 and §10 say "upcoming", and the badge undercount is only possible on the mentor's current day — cost if wrong: today's cap day can lack its "2 of 2" badge.
- Ruling: A-M6 accepted — new shared formatOtherTime(at, tz, viewerTz) in Task 2 (adds the date when the two sides are on different days, which is every US class); used by both emails (Task 6) and the confirmation page (Task 10); tests in Tasks 2 and 6, plus a BST family-line check — extends spec §9/§10 copy, whose same-day form is unchanged — cost if wrong: one helper and its call sites.
- Ruling: A-M7 accepted (comment), A-M8 / B-M1 accepted (v5 object forms, invalidateQueries) — cost if wrong: none.
- Ruling: B-I1 accepted — Task 10 sets tsconfig types ["node", "vite/client"] and commits tsconfig.json — reproduced TS2882 on typescript 7.0.2 — cost if wrong: none.
- Ruling: B-I2 accepted — `docker compose run --rm --build test` in Tasks 13, 14 and the README — cost if wrong: a slower test run.
- Ruling: B-M3 accepted — ukHours, curl body and the Task 11 setup inlined; "mockup N" replaced by "spec §10" (mockups never entered the repo) — cost if wrong: none.
- Ruling: B-M4, B-M5 (axllent/mailpit:v1.31.6), B-M6 (skip 57P01 in the pool error listener) accepted — cost if wrong: none.
- Ruling: B-M7 partly accepted — PGTZ dropped (libpq client variable, no server effect); max_connections=200 kept (cheap headroom for parallel test files across three runs); api.ts and ui.tsx kept (approved file map) — cost if wrong: two extra small files.
- Ruling: briefs lack the plan header — every dispatch also gets context.md (plan header, global constraints, review focus, file map), copied from the plan after these edits — cost if wrong: a little extra reading per subagent.

## Pre-flight scan (after review edits)
Evidence: reviewer A rebuilt Tasks 1, 2, 4 and the seed to the plan's text; reviewer B built Tasks 1–9 and 13 verbatim (94 tests pass in both zones, tsc clean through Task 9, docker stack healthy). The rows below are my own read of the edited plan.

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T2 | time.ts, time.test.ts; offsetMinutes, localDate | consistent; T2 consumes now names localDate (for formatOtherTime) |
| T1 → T4 | zonedTimeToInstant, localDate, weekdayOf, addDays | consistent |
| T1 → T5, T7, T9 | localDate; isValidTimeZone (T7); time helpers in booking.ts (T9) | consistent |
| T2 → T6 | formatWhen, formatDate, formatSpan, formatOtherTime, cityName | consumes list updated with formatOtherTime; zoneAbbreviation/formatTime still reachable via it |
| T2 → T9–T12 | formatters, formatOtherTime (T10 confirmation) | consistent |
| T3 → T5 | createTestDb, insertMentor, schema; T5 modifies test-db.ts | consistent |
| T3 → T7, T8, T13 | createPool, migrations; docker-compose.yml (T13 adds app, test) | consistent |
| T4 → T5, T7 | Mentor, ActiveBooking, isBookableTime, worksAt, DAILY_CAP, buildSlots | consistent |
| T5 → T7, T8 | bookSlot, loadMentors, loadActiveBookings, getBookingWithMentor, expectBookingRulesHold | consistent |
| T6 → T7, T8 | Mailer, renderEmails, createSmtpMailer (T7 dead-port test, T8 main.ts) | T7 consumes updated |
| T7 → T8 | createApp, createClock | consistent |
| T7 → T9–T12 | types.ts DTOs | consistent |
| T9 → T10–T12 | booking.ts helpers; T12 appends mentorDays to booking.ts/test | consistent |
| T10 → T11, T12 | App.tsx (both add a route), api.ts, hooks.ts, ui.tsx (DemoBanner, Card) | consistent |
| T1 → T10 | tsconfig.json, vite.config.ts | T10 modifies both; dispatch must say keep the T1 test block in vite.config.ts |
| T13 → T14 | compose commands | consistent after --build fix |
| T1 | scripts, tsconfig, time tests vs algorithm | self-consistent |
| T2 | formatter tests vs rules | self-consistent (new strings checked under UTC, Chatham, LA) |
| T3 | compose, migrations, db test | self-consistent |
| T4 | slots tests vs algorithm | self-consistent (new cap test hand-checked) |
| T5 | booking tests vs lock design; red-run step | self-consistent |
| T6 | email tests vs copy | self-consistent (copy lines updated with formatOtherTime) |
| T7 | api tests vs routes and clock | self-consistent (14 Oct test hand-checked against ukHours: Wed 15/16/17Z) |
| T8 | seed tests vs seed steps | self-consistent |
| T9 | reducer and helper tests | self-consistent |
| T10 | shell; manual check | self-consistent |
| T11 | booking page; manual checks | self-consistent |
| T12 | mentorDays test vs page | self-consistent |
| T13 | Dockerfile stages vs compose | self-consistent |
| T14 | README sections vs spec §15 | self-consistent; TRANSCRIPT.md out of scope |
- Task 1: BASE ead9690
- Task 1: implementer dispatched (sonnet), agent a28a08adfd34ea953
- Task 1: implementer DONE 4ced656 (29/29 x3 zones); reviewer dispatched (sonnet) on review-ead9690..4ced656.diff
- Task 1 review: spec ✅, quality needs fixes (I1 unbounded formatter cache keyed on client zone text; minors).
- Ruling: T1-I1 accepted — bound the formatter cache (clear past 500 entries) with a ponytail note; plan-mandated gap (the plan specified the cache) — cost if wrong: a few rebuilt formatters after a clear.
- Ruling: T1-M1 accepted — pin @types/node@^22 to the engines floor — cost if wrong: none.
- Ruling: T1-M2 accepted — resync the lockfile (npm install --package-lock-only) — cost if wrong: none.
- Ruling: T1-M3 rejected — keep package.json repository/version; harmless public url — cost if wrong: two noise lines.
- Ruling: T1-M4 noted for Task 10 (vite 8 peer churn); T1-M5 rejected (U+2212 branch is defensive, brief coverage is complete).
- Task 1: fix round 1 sent to implementer (resume)
- Task 1: fix round 1 DONE fd51699; re-review dispatched (haiku) on review-4ced656..fd51699.diff
- Task 1 re-review: all findings addressed; new minors: clear runs before a constructor that may throw; key not normalized; no bound test.
- Ruling: move the cache clear to after the constructor, folded into Task 2 (it edits time.ts anyway) — cost if wrong: none.
- Ruling: key normalization and a bound test parked for the final review — the bound already caps memory — cost if wrong: cache churn only.
- Task 1: complete (4ced656, fd51699)
- Task 2: BASE fd51699
- Task 2: implementer dispatched (sonnet), agent a901b4f0e2a4b236f
- Ruling: keep en-GB 'Sept' for September — it is the locale's own form and valid British usage; no task test covers September — cost if wrong: one month reads 'Sept' not 'Sep'.
- Task 2: implementer DONE_WITH_CONCERNS f09bb07 (46/46 x3; Sept concern ruled); reviewer dispatched (sonnet) on review-fd51699..f09bb07.diff
- Task 2 review: spec ✅, quality Approved. Minors parked for final review: formatZone renders 'UTC (UTC)' for the UTC zone (fix: abbr alone when it equals the city); cityName gives 'St Johns' / 'Eastern' for St_Johns and US/Eastern; no spring-forward span test.
- Task 2: complete (f09bb07)
- Task 3: BASE f09bb07; implementer dispatched (sonnet), agent a9afa90fa7fd62154
- Task 3: implementer DONE 4e4d7f1 (49 x3, db+mailpit left running); reviewer dispatched (sonnet) on review-f09bb07..4e4d7f1.diff
- Task 3 review: spec ✅, quality Approved. Both additions (rollback in migrate, drop-and-rethrow in createTestDb) judged necessary.
- Ruling: bind every published compose port to 127.0.0.1 (db, mailpit, later app) — the db has well-known credentials and localhost URLs still work — folded into Task 13, which edits docker-compose.yml — cost if wrong: a reviewer on a remote VM must drop the prefix.
- Parked for final review: rollback().catch so a broken connection doesn't mask the migrate error (db.ts, test-db.ts); admin pool not ended when create database fails; drop() not re-entrant; no concurrent-migrate test; package.json key order.
- Task 3: complete (4e4d7f1)
- Task 4: BASE 4e4d7f1
- Task 4: implementer dispatched (sonnet), agent a2d213eb7de1cd57b
- Task 4: implementer DONE b814184 (59 x3); reviewer dispatched (opus) on review-4e4d7f1..b814184.diff
- Task 4 review: spec ✅, quality Approved; Important (plan-mandated): 'IST' in a test comment breaks the wording rule.
- Ruling: the wording rule covers comments that label times or the cap day; output strings such as '9:30 PM IST' are display, and time.ts:17 quotes "IST" as rejected input — fixed both plan comments (slots test, mentorDays test) to 'in Kolkata' in a plan commit; code comment goes to fix round 1 with the slots.ts:37 padding-comment reword — cost if wrong: none.
- Parked for final review: round-up not exercised by the 20:30 Kolkata test (the NY 02:30 case covers it); no uniqueness test across mentors; London DST covered only via arrayContaining.
- Task 4: fix round 1 sent to implementer (resume)
- Ruling: Task 4 fix round 1 (two comments, 2-line diff) verified by the controller reading the diff, no re-review agent — a comment-only diff has nothing for a reviewer to run — cost if wrong: none.
- Task 4: complete (b814184, 5496479)
- Task 5: BASE 5496479
- Task 5: implementer dispatched (sonnet), agent a3de6c0018f027af9
- Task 5: implementer DONE_WITH_CONCERNS 2fb4649 (66 x3; red run saved). Concerns: table is mentor_hours (controller note was wrong); getBookingWithMentor throws 22P02 on a bad uuid (Task 7 validates z.uuid() first — carry to Task 7 dispatch); red-run.txt quotes bookings.test.ts:84 (carry to Task 14).
- Task 5: reviewer dispatched (opus) on review-5496479..2fb4649.diff
- Task 5 review (opus): spec ✅, quality needs fixes. Lock verified under read committed (cap holds) vs repeatable read (cap broken).
- Ruling: T5-I1 accepted — guard the rollback in catch with .catch(() => {}) so the first error survives — cost if wrong: none.
- Ruling: T5-M1 accepted now, not parked — an 'error' on a checked-out client is uncaught and kills the server if postgres ends a connection mid-transaction; one line in createPool (db.ts, Task 3's file) adding a per-client error listener — cost if wrong: none.
- Ruling: T5-M2 accepted — 'begin isolation level read committed' makes the design explicit whatever the db default — cost if wrong: none.
- Ruling: T5-M3 accepted — one test appended at the end of bookings.test.ts (keeps red-run.txt's line 84 valid) pinning the ordering query: a cancelled row and a booking on another local day must not count — cost if wrong: one more test.
- Ruling: T5-M4 accepted (two plain if blocks instead of the day sentinel); T5-M5 rejected (loading ~10 mentors is fine) — cost if wrong: none.
- Task 5: fix round 1 sent to implementer (resume)
- Task 5: fix round 1 DONE 30bc1f2 (67 x3; both mutations RED)
- Task 5: re-review dispatched (sonnet) on review-2fb4649..30bc1f2.diff; implementer's idle-transaction 57P01 note (no crash, next query fails cleanly) accepted as is
- Task 5 re-review: all findings addressed, no new breakage. Parked: no committed regression test for the rollback guard or the client error listener (scratch-verified, hard to make deterministic).
- Task 5: complete (2fb4649, 30bc1f2)
- Task 6: BASE 30bc1f2
- Task 6: implementer dispatched (sonnet), agent a45fb0491ffe3cd90
- Task 6: implementer DONE 4efcab8 (71 x3; mailpit delivery and dead-port rejection checked by script)
- Task 6: reviewer dispatched (sonnet) on review-30bc1f2..4efcab8.diff
- Task 6 review: spec ✅, quality Approved. Parked for final review: no smtp connection/greeting timeouts (send runs after the response in Task 7, so no request blocks); email tests use toContain only (brief-mandated); dead `?? name` fallback in the first-name helper; @types/nodemailer probably shadowed by nodemailer 10's own typings.
- Task 6: complete (4efcab8)
- Task 7: BASE 4efcab8
- Task 7: implementer dispatched (sonnet), agent ad11fb4f07f12a75a
- Task 7: implementer DONE 8ae1340 (83 x3; new Date() mutation in each route turns the clock test red)
- Task 7: reviewer dispatched (sonnet) on review-4efcab8..8ae1340.diff
- Task 7 review: spec ✅, quality Approved (real-http probes of validation, injection, clock, email-after-response, spa fallback).
- Ruling: T7-M1 accepted — body-parser errors with a string type and 4xx status map to 400 VALIDATION_FAILED, not logged; sendFile's bare status 404 stays 500 — deviates from the brief's 'anything else: 500' because those are client faults — cost if wrong: none.
- Ruling: T7-M2 accepted — wrap the post-response render and send in try/catch that calls log — cost if wrong: none.
- Ruling: T7-M3 accepted — tests: a never-settling mailer still gets its 201; /api/mentors now equals the demo clock — both proven missing by mutation — cost if wrong: two more assertions.
- Ruling: T7-M4 accepted — name regex also rejects \p{Zl} and \p{Zp} — cost if wrong: none.
- Parked for final review: T7-M5 root-level field key '' and Zod's absent-field message; T7-M6 isValidTimeZone keeps non-canonical case (europe/london stored as typed); T7-M7 a failure between commit and re-read returns 500 for a booked class (plan-mandated shape, tiny window).
- Task 7: fix round 1 sent to implementer (resume)
- Task 7: fix round 1 DONE 766f64e (86 x3); never-settling-mailer test fails only at the 20s timeout under mutation — accepted
- Task 7: re-review dispatched (haiku) on review-8ae1340..766f64e.diff
- Task 7 re-review: all findings addressed, no new breakage. Parked for final review: a corrupt gzip body and a malformed percent-escape in a route param still return logged 500s (untyped 400s from zlib and the router).
- Task 7: complete (8ae1340, 766f64e)
- Task 8: BASE 766f64e
- Task 8: implementer dispatched (sonnet), agent a12c6c0e68432e667
- Task 8: implementer DONE 9488be0 (90 x3; smoke test 201 + two mailpit subjects; 53 pre-booked).
- Ruling: Node as PID 1 ignores SIGTERM — give the app service init: true, folded into Task 13 — cost if wrong: none.
- Parked for final review: two app instances starting together on an empty db could both pre-book (compose runs one app).
- Task 8: reviewer dispatched (sonnet) on review-766f64e..9488be0.diff
- Task 8 review: spec ✅, quality Approved (ran against a throwaway db: data, idempotency, termination, startup failures exit 1).
- Ruling: T8-M2 routed to Task 14 — README says `docker compose down -v` before `docker compose up` for a fresh demo, because the pre-booked full day is placed relative to the first start and slides into the past on a kept volume — cost if wrong: none.
- Parked for final review: no test pins the mentor data (Vikram no Friday, Divya no Tuesday); createPool has no connectionTimeoutMillis; seed email uses replace not replaceAll.
- Task 8: complete (9488be0)
- Task 9: BASE 9488be0
- Task 9: implementer dispatched (sonnet), agent a7b51a150589b040c
- Task 9: implementer DONE_WITH_CONCERNS e279d17 (105 x3).
- Ruling: "if nothing matches" means nothing in the whole combined list (the literal brief text); Europe/Paris stays in the 'all' group with value === current — cost if wrong: Paris users scroll for their zone.
- Ruling: zoneOptions costs 25–35 ms per call and builds ~840 formatters, flushing the 500-entry cache; the booking page re-renders on every state change and useMemo is banned — memoize at module level keyed by current zone + UTC hour (labels refresh within an hour of a clock change); goes into the Task 9 fix round — cost if wrong: one small module-level cache.
- Task 9: reviewer dispatched (sonnet) on review-9488be0..e279d17.diff
- Task 9 review: spec ✅, quality Approved (host-zone probes byte-identical under UTC, LA, Chatham).
- Ruling: T9-M2 accepted — initialTimeZone validates the device zone and falls back to 'UTC' (an invalid device zone would throw in groupIntoDays); a small extension of the brief's 'stored if valid, else device' — cost if wrong: none.
- Ruling: T9-M1 routed to Task 11 — a selected time can fall outside the 14 shown days after a zone change; BookingPage treats it as nothing selected (Confirm reads "Choose a time") — cost if wrong: none.
- Ruling: T9-M3 partly accepted — add the nearestOpenTimes tie test (the brief specifies it) and slotSelected clearing unavailable; NY dayMixesOffsets test parked — cost if wrong: none.
- Task 9: fix round 1 sent to implementer (resume): zoneOptions memo, device-zone guard, two tests.
- Task 9 fix round 1 DONE 3bf6965 (107 x3); verified by the controller reading the 20-line diff (memo keyed by zone+hour, device guard) — cost if wrong: none.
- Task 9: complete (e279d17, 3bf6965). Note for Task 11: zoneOptions returns a shared array; never mutate it.
- Task 10: BASE 3bf6965
- Task 10: implementer dispatched (sonnet), agent aa5bf2f614b49e11e
- Task 10: implementer DONE efd6610 (build ok, 107 x3, playwright check incl. 375px)
- Task 10: reviewer dispatched (sonnet) on review-3bf6965..efd6610.diff
- Task 10 review: spec ✅ (theme block byte-identical to spec §10), quality Approved pending the focus ring.
- Ruling: T10-I1 accepted, deviating from the brief/spec "focus outline in brand" — brand on white is 1.78:1, under WCAG 1.4.11's 3:1; use `outline: 2px solid var(--color-ink); outline-offset: 2px; box-shadow: 0 0 0 4px var(--color-brand)` (ink carries contrast, brand keeps the look) — accessibility basics beat a styling line — cost if wrong: a darker ring than the mockup.
- Ruling: T10-M1 accepted — a 2xx with a non-JSON body throws ApiError(502, INTERNAL) instead of resolving null — cost if wrong: none.
- Ruling: T10-M2 accepted (NotFoundCard in ui.tsx used by App and ConfirmationPage); T10-M3 accepted (shared primary-button class string exported from ui.tsx for Task 11) — cost if wrong: none.
- Parked for final review: T10-M4 no test pins api.ts error mapping or the retry predicate.
- Carry to Task 11: derive 409 alternatives at render from useSlots().data, not a snapshot in onUnavailable; peer-focus-visible on radio labels (the global ring paints the hidden input); useId for every label/input; selected time outside the 14 shown days counts as nothing selected; never mutate zoneOptions' shared array.
- Task 10: fix round 1 sent to implementer (resume)
- Task 10 fix round 1 DONE fcab9c2 (107 x3; ink ring confirmed in playwright); verified by the controller reading the diff.
- Incident: the Task 10 implementer put an unrelated PID (5986) in a kill command by mistake; the process is gone and unidentifiable; db and mailpit healthy. Reported to the user. implementer-rules.md now says to kill only PIDs captured at start or read from lsof on your own port.
- Task 10: complete (efd6610, fcab9c2). Carry to Task 11: primaryButton has no disabled: styling — add disabled variants on buttons.
- Task 11: BASE fcab9c2
- Task 11: implementer dispatched (opus — the most state-heavy UI), agent a8a3f7375d80d0514
- Task 11: implementer DONE_WITH_CONCERNS 6d11f0a (107 x3; all 8 browser checks pass + 400 path). Fixed in-check: fieldset min-w-0 overflow; flushSync before focusing Confirm. Added a ref guard against a double click landing before isPending renders. The permission classifier denied 4 actions (guard-removal check, one code run, two screenshots); the implementer did not work around them, and neither will the controller — reported to the user.
- Task 11: reviewer dispatched (opus) on review-fcab9c2..6d11f0a.diff
- Task 11 review (opus): spec ✅, quality needs fixes. I1: Back stays enabled during a pending booking; Back → resubmit calls book.reset(), which detaches the observer, so the per-call onError never clears the ref guard and Confirm is dead until reload.
- Ruling: T11-I1 accepted — `disabled={busy}` on the Back button (not clearing the ref in onSubmit, which would reopen the two-mentor double booking) — cost if wrong: none.
- Ruling: keep the two copy extras — the 409 heading includes the zone abbreviation ("Sorry, 1:00 AM BST on …"), which tells the two 1:00 AMs apart and follows the display-style rule; "1 time" singular matches "1 slot" — extends spec §10 copy — cost if wrong: two strings differ from the spec.
- Ruling: T11-M2 accepted — after a zone change, scroll the checked day chip into view (flushSync then scrollIntoView nearest), same pattern as the alternative-pick focus — cost if wrong: none.
- Ruling: T11-M3 (whitespace names) and T11-M4 (flushSync) left as is — the server's 'Required' lands on the right field and keeps the chosen time; flushSync is the minimal way to focus a just-enabled button — cost if wrong: none.
- Task 11: fix round 1 sent to implementer (resume)
- Task 11 fix round 1 DONE 547c27e (107 x3; browser re-check of zone change and Back-while-pending); verified by the controller reading the 20-line diff.
- Task 11: complete (6d11f0a, 547c27e)
- Task 12: BASE 547c27e
- Task 12: implementer dispatched (sonnet), agent a227ae0d70513096c
- Task 12: implementer DONE 3454100 (108 x3; playwright: 10 cards, 24 cap badges, 2 cols at 1100px, 1 col at 375px)
- Task 12: reviewer dispatched (sonnet) on review-547c27e..3454100.diff
- Task 12 review: spec ✅, quality Approved. Parked for final review: 440px card cap misaligns with the h1 at ~480–767px; no h1 during loading/error; mentorDays test doesn't pin in-day sort, [] or .000Z passthrough; first name uses split(' ') while Avatar splits on /\s+/.
- Task 12: complete (3454100)
- Task 13: BASE 3454100
- Task 13: implementer dispatched (sonnet), agent a0b4b6c887e220627; carries 127.0.0.1 ports, init: true, --build
- Done: spec §15 test command now has --build; plan task 14 says three test runs (docs commit).
- Task 13: implementer DONE f5f2314 (docker test 108 x3 in 10.1s; app 267MB, test 564MB; down -v 0.8s with init)
- Task 13: reviewer dispatched (sonnet) on review-3454100..f5f2314.diff; docs commit 4006d4e landed meanwhile (spec/plan only)
- Task 13 review: spec ✅, quality Approved (images inspected: no devDeps, test imports, PDFs or secrets in runtime). Parked for the final fix wave: runtime runs as root (USER node); .dockerignore `*.pdf` → `**/*.pdf`; healthcheck `wget -qO-` stores the slot JSON in health logs (→ -qO /dev/null).
- Task 13: complete (f5f2314)
- Task 14: BASE 4006d4e
- Task 14: implementer dispatched (opus — reviewer-facing README), agent a1f16e43597f86535; facts file readme-notes.md
- Final review prep: parked findings collected in final-parked.md
- Task 14: implementer DONE_WITH_CONCERNS f7ec9f4 (README; red-run.txt removed; final verification 108 x3 in docker; playwright click-through on real and demo clocks, both emails each time; stack left on the real clock).
- For the final fix wave: a day with no slots left (today after the 2-hour lead, or a day nobody works) shows "Full" and "Every mentor is booked on {day}." — wrong copy; only all-booked days should read Full. README says npm test needs db and mailpit; only db is needed.
- Final review prep: added Task 14 concerns to final-parked.md
- Task 14: controller scanned README for machine details (clean); reviewer dispatched (sonnet) on review-4006d4e..f7ec9f4.diff
- Task 14 review: spec ✅, quality approved after one fix. I1: README:335 "Tue 27 Oct, 4:00 PM BST (London)" is wrong for 2026 (London is GMT from 25 Oct); the same slip was in plan :43/:253, spec :248/:321, context.md and time.ts:140.
- Ruling: use "Fri 23 Oct, 4:00 PM BST (London)" (time.test.ts:49) everywhere; controller fixed plan, spec, context.md (b5f4edf); README and the time.ts comment go to fix round 1 — cost if wrong: none.
- Ruling: tests need only db (README, plan, context fixed); README trims accepted (quick start, duplicate demo block, repeated three-zone line, test files in layout, repeated bio) and three accuracy fixes (one function, booking window 409, 64-char zone cap) — cost if wrong: none.
- Task 14: fix round 1 sent to implementer (resume)
- Task 14 fix round 1 DONE defd557 (README trims and fixes, time.ts comment); verified by the controller (diff, verbatim strings, leak scan clean).
- Task 14: complete (f7ec9f4, defd557)
- All 14 tasks complete. Final review: BASE ead9690 (reviewed plan), HEAD defd557.
- Final review: dispatched (opus) on ead9690..defd557; report to final-review.md
- Final review (opus): Critical 0 · Important 1 · Minor 6; "Ready to merge: with fixes". Report final-review.md.
- Ruling: FR-I1 fix — a day with no times reads "No slots" (chip) and "No times are left today." / "There are no times on {day}." (empty state); "Full" and "Every mentor is booked" only when every time is taken. Spec §10 and plan task 11 amended (a469b07). Label logic moves to booking.ts with a test — cost if wrong: copy change.
- Ruling: wave also takes migrate rollback guard; Dockerfile USER node; healthcheck wget -qO /dev/null; FR-M1 peer-checked:border-ink on chips and slots; FR-M2 focus the 409 alert and the first invalid field after a 400; FR-M3 pageshow persisted → reload (iPhone Safari bfcache would restore a dead "Booking…"); FR-M4 email maxLength 254; FR-M5 zone 400 → "Please pick your time zone from the list."; FR-M6 *.pdf in .gitignore — each one line or attribute — cost if wrong: none.
- Ruling: every other parked item left, per the final review's line-by-line verdicts (cosmetic, test-only, or unreachable by the UI).
- Final fix wave: dispatched (opus, fresh)
- Final fix wave DONE_WITH_CONCERNS f0e2b5a (109 x3 local and docker; app runs as node; playwright: No slots / No times are left today at 22:34Z, 23–24 Oct still Full; 409 focuses the alert; 400 focuses the first invalid field).
- Ruling: accept replacing peer-checked:border-brand with border-ink (adding both leaves a dead class and order-dependent wins) — cost if wrong: one word.
- Noted: the bfcache reload line is unverified in Safari/Firefox (Chromium never restores this page).
- Final fix wave: scoped re-review dispatched (sonnet) on review-a469b07..f0e2b5a.diff
- Final fix wave re-review: all 10 items addressed, no new Critical/Important breakage.
- Ruling: residual comment nit fixed by the controller (main.tsx bfcache comment says "may restore", since it was never reproduced) — comment-only, typecheck ok.
- Ruling: residual by design — a 400 flagging both a detail field and parentTimeZone bounces to step 1 first; the zone sentence shows after resubmit — cost if wrong: one extra round trip in a case the UI cannot produce.
- Final review complete.
