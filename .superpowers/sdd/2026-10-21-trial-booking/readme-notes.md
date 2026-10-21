# Facts the README must state (from execution)

The build extends or departs from the spec in the places below. Each one belongs in the README, in the section that fits, stated plainly. Most go in "Assumptions and trade-offs".

## Behaviour that goes beyond the spec's wording
- **Three host zones, not two.** The suite runs under `TZ=UTC`, `TZ=Pacific/Chatham` and `TZ=America/Los_Angeles`. Chatham is ahead of UTC and Los Angeles is behind it, like every US parent's browser. A local-time getter on a UTC-midnight value passes UTC and Chatham but fails Los Angeles. The spec was updated to match.
- **The other side's time carries its date when the days differ.** The parent's "where it's …" line and the mentor's "For the family: …" line add the date whenever the two sides fall on different calendar days, which is every US evening class. Example: "For the family: Mon 26 Oct, 5:00 PM EDT in New York". Same-day text is unchanged ("9:30 PM IST").
- **The 409 alert names the zone.** "Sorry, 1:00 AM BST on Sun 25 Oct is no longer available." The abbreviation tells the two 1:00 AMs apart on the clock-change day.
- **Body read errors are 400s.** An oversized body or an unknown `Content-Encoding` returns `400 VALIDATION_FAILED`, not 500. A malformed JSON body was already a 400.
- **Names reject line and paragraph separators** (U+2028, U+2029) as well as control characters.
- **The keyboard focus ring is ink with a brand halo,** not plain brand yellow. Brand on white is 1.78:1, under WCAG 1.4.11's 3:1 for focus indicators.

## Operations
- **Every published port is bound to `127.0.0.1`** (app 3000, Mailpit 8025 and 1025, Postgres 5433), because the database uses the well-known `bookings`/`bookings` credentials. `localhost` URLs work. To show the app from another machine, drop the `127.0.0.1:` prefix on the app port.
- **Fresh demo:** the seed pre-books a fully booked day and a full hour relative to the first start, and only when `bookings` is empty. On a database volume kept for a few days, the full day slides into the past. Run `docker compose down -v` before `docker compose up` for a fresh demo. That is also how to reset.
- **Tests in Docker:** `docker compose run --rm --build test`. The `--build` matters because the test service sits under a profile, so `up --build` never rebuilds it.
- The demo clock (`DEMO_NOW`) starts again from `DEMO_NOW` whenever the app restarts.

## Known limits (honest list)
- The mentors page's "2 of 2 that day" badge counts upcoming bookings only, as the API returns them. On the mentor's current day, a class that has already happened isn't counted.
- If the server fails between committing a booking and re-reading it, the client gets a 500 for a booking that exists. The window is tiny.
- One app instance is assumed. Two instances starting together on an empty database could both pre-book the seed.

## `ponytail:` notes in the code (list them under trade-offs)
- `src/shared/time.ts`: Intl only; swap for `Temporal.ZonedDateTime` once Node and Safari ship it.
- `src/shared/time.ts`: the formatter cache clears itself past 500 entries; use an LRU if real zones ever churn.
- `src/shared/time.ts`: six English locales pick zone abbreviations; add a per-zone map if one picks a wrong name.
- `src/web/booking.ts`: a one-entry cache for the zone-picker options, keyed by zone and UTC hour.
