# Parked findings for the final review

Each line was deferred during a task review. The controller already ruled these non-blocking for their task; the final review decides which belong in the one fix wave.

- Ruling: key normalization and a bound test parked for the final review — the bound already caps memory — cost if wrong: cache churn only.
- Task 2 review: spec ✅, quality Approved. Minors parked for final review: formatZone renders 'UTC (UTC)' for the UTC zone (fix: abbr alone when it equals the city); cityName gives 'St Johns' / 'Eastern' for St_Johns and US/Eastern; no spring-forward span test.
- Parked for final review: rollback().catch so a broken connection doesn't mask the migrate error (db.ts, test-db.ts); admin pool not ended when create database fails; drop() not re-entrant; no concurrent-migrate test; package.json key order.
- Parked for final review: round-up not exercised by the 20:30 Kolkata test (the NY 02:30 case covers it); no uniqueness test across mentors; London DST covered only via arrayContaining.
- Ruling: T5-M1 accepted now, not parked — an 'error' on a checked-out client is uncaught and kills the server if postgres ends a connection mid-transaction; one line in createPool (db.ts, Task 3's file) adding a per-client error listener — cost if wrong: none.
- Task 5 re-review: all findings addressed, no new breakage. Parked: no committed regression test for the rollback guard or the client error listener (scratch-verified, hard to make deterministic).
- Task 6 review: spec ✅, quality Approved. Parked for final review: no smtp connection/greeting timeouts (send runs after the response in Task 7, so no request blocks); email tests use toContain only (brief-mandated); dead `?? name` fallback in the first-name helper; @types/nodemailer probably shadowed by nodemailer 10's own typings.
- Parked for final review: T7-M5 root-level field key '' and Zod's absent-field message; T7-M6 isValidTimeZone keeps non-canonical case (europe/london stored as typed); T7-M7 a failure between commit and re-read returns 500 for a booked class (plan-mandated shape, tiny window).
- Task 7 re-review: all findings addressed, no new breakage. Parked for final review: a corrupt gzip body and a malformed percent-escape in a route param still return logged 500s (untyped 400s from zlib and the router).
- Parked for final review: two app instances starting together on an empty db could both pre-book (compose runs one app).
- Parked for final review: no test pins the mentor data (Vikram no Friday, Divya no Tuesday); createPool has no connectionTimeoutMillis; seed email uses replace not replaceAll.
- Ruling: T9-M3 partly accepted — add the nearestOpenTimes tie test (the brief specifies it) and slotSelected clearing unavailable; NY dayMixesOffsets test parked — cost if wrong: none.
- Parked for final review: T10-M4 no test pins api.ts error mapping or the retry predicate.
- Task 12 review: spec ✅, quality Approved. Parked for final review: 440px card cap misaligns with the h1 at ~480–767px; no h1 during loading/error; mentorDays test doesn't pin in-day sort, [] or .000Z passthrough; first name uses split(' ') while Avatar splits on /\s+/.
- Task 13 review: spec ✅, quality Approved (images inspected: no devDeps, test imports, PDFs or secrets in runtime). Parked for the final fix wave: runtime runs as root (USER node); .dockerignore `*.pdf` → `**/*.pdf`; healthcheck `wget -qO-` stores the slot JSON in health logs (→ -qO /dev/null).
- Task 14: a day with no slots left (today after the 2-hour lead, or a day nobody works) shows "Full" and "Every mentor is booked on {day}." — only all-booked days should read Full.
- Task 14: README says npm test needs db and mailpit; only db is needed.
