# Task 10 report: web shell, API client, hooks, confirmation page

Status: DONE (one thing for the controller: see "Concerns").
Commit: `efd6610 feat(web): add shell, palette, api client, hooks and confirmation page` (12 files, no trailer).

## What was implemented
- **Dependencies** (dev, unpinned): `vite @vitejs/plugin-react react react-dom @tanstack/react-query tailwindcss @tailwindcss/vite @types/react @types/react-dom`. No peer conflict, no `--force`. `npm ls vite` shows a single `vite@8.3.4`, deduped under `@tailwindcss/vite`, `@vitejs/plugin-react` and `vitest`. Resolved: react 19.3.1, @tanstack/react-query 5.104.5, tailwindcss 4.3.3.
- **`vite.config.ts`**: `react()` and `tailwindcss()` plugins, `build.outDir: 'dist/web'`, `server.proxy: { '/api': 'http://localhost:3000' }`. The `test: { testTimeout: 20_000, hookTimeout: 20_000 }` block is kept, and `defineConfig` is still imported from `vitest/config`.
- **`package.json`**: scripts `dev` (`vite`) and `build` (`vite build`). **`tsconfig.json`**: `"types": ["node", "vite/client"]`.
- **`index.html`**: Fontshare Satoshi link (spec URL), `#root`, module script. Also a `rel="icon" href="data:,"` line so the browser doesn't request `/favicon.ico` and log a 404 (not in the brief; one line), plus two `preconnect` hints to Fontshare.
- **`src/web/index.css`**: `@import "tailwindcss"`, the `@theme` block copied verbatim from spec §10 (comments included), `body` as `bg-page text-ink antialiased`, and a 3px `:focus-visible` outline in `--color-brand` with a 2px offset.
- **`src/web/api.ts`**: `ApiError` (`status`, `code`, `fields` declared as fields and assigned in the constructor body, so erasable-syntax safe), then `getSlots`, `getMentors`, `getBooking` (id is `encodeURIComponent`ed), `createBooking`. A non-JSON or malformed error body (for example the Vite proxy's 502) becomes `ApiError(status, 'INTERNAL', ...)`. A fetch rejection (offline) becomes `ApiError(503, 'INTERNAL', "We can't reach the server...")`. I chose 503 so the retry rule treats it as retryable and the UI gets a readable message instead of "Failed to fetch".
- **`src/web/hooks.ts`**: `useTimeZone` (state from `initialTimeZone(read, device)`, read and write both wrapped in `try`, writes `localStorage.tz` only in `setTimeZone`, returns `deviceTimeZone`). `useSlots` (key `['slots']`, `refetchInterval: 60_000`). `useBookSlot(onUnavailable)`: on success `location.assign('/bookings/' + id)`; on a 409 it invalidates `['slots']` (not awaited, so the mutation settles immediately) and calls `onUnavailable(variables.startsAt)`. No `useMemo`, `useCallback`, `useOptimistic` or `useEffect`.
- **`src/web/main.tsx`**: `QueryClientProvider` in `StrictMode`. The queries' `retry` is `failures < 3 && !(error instanceof ApiError && error.status < 500)`, so the default of 3 attempts is kept for 5xx and network errors.
- **`src/web/ui.tsx`**: `Card`, `CardTitle` ("FREE" underlined with `decoration-brand`), `Progress`, `DemoBanner` (`now` is the ISO string, text exactly as in the brief). I also added an `Avatar({ name })` for the initials square (see Concerns).
- **`src/web/App.tsx`**: header (a "Codeyoung" `<a href="/">` wordmark and an "Our mentors" `<a href="/mentors">`), and a `location.pathname` switch. `/^\/bookings\/([0-9a-f-]{36})$/` renders `ConfirmationPage`; everything else renders the not-found card with a home link. Tasks 11–12 add `/` and `/mentors`.
- **`src/web/ConfirmationPage.tsx`**: `useQuery(['booking', id])`. It shows `Progress step={3}`, "You're booked!", "{childName}'s free trial class", `formatDateWithYear` then `formatSpan(start, end, parentTimeZone)`, "Your mentor joins from {city}, where it's {formatOtherTime(...)}.", a mentor card (initials, name, subjects, bio), a "Join class" link to `classLink` (new tab, `rel="noreferrer"`) with the URL text beneath, and "We've emailed this to {parentEmail}.". Other states: loading (`role="status"`), a 404 shows "We couldn't find that booking." with a home link, and any other error shows a `role="alert"` message. The parent zone is the booking's own `parentTimeZone`.
- Palette rule: no raw hex, no `rounded-full` (the built-in radius is not an `@theme` token). The progress segments use `rounded-field`, which reads as a pill at 4px tall, and the avatar uses `rounded-cta`.

## Verification
- `npm run typecheck && npm run build`: exit 0; `dist/web/index.html` plus `assets/index-*.css` (10.75 kB) and `index-*.js` (258.65 kB). `dist/` is git-ignored and was not committed.
- `npm test` (all three host zones, UTC, Pacific/Chatham, America/Los_Angeles): 8 files, 107 tests passed in each zone, with the new Vite plugins in the config.
- Browser check (Playwright, with both `npm run dev:server` and `npm run dev` running; both are now stopped by PID and ports 3000 and 5173 are free; the `db` and `mailpit` containers were left running):
  - Created a booking with the brief's curl through the Vite proxy (`Europe/London`, slot `2026-10-27T15:00:00.000Z`, mentor Priya Sharma).
  - `/bookings/<id>` rendered: "You're booked!", "Rohan's free trial class", "Tue 27 Oct 2026", "3:00–4:00 PM GMT (London)", "Your mentor joins from Kolkata, where it's 8:30 PM IST.", the mentor card (PS, Coding, Math, bio), a yellow "Join class" with the URL beneath, and "We've emailed this to asha@example.com.". Satoshi 400, 500 and 700 all reported `loaded`; body background was `rgb(250, 250, 250)`.
  - A made-up UUID showed "We couldn't find that booking." and `/nope` showed "We couldn't find that page." with a link to `/`.
  - At 375px wide the card is full width with no horizontal overflow (scrollWidth 375 equals clientWidth).
  - The built app also serves from Express on :3000 (`/bookings/<id>` returns `index.html`), and `/api/bookings/not-a-uuid` returns 404.
  - Screenshots are in the git-ignored `.playwright-mcp/` (`confirmation.png`, `confirmation-mobile.png`). The Playwright tool refused to write to the scratchpad, since it only allows the repo and `.playwright-mcp`.
- The only console error was the expected 404 for the made-up booking id (plus `/favicon.ico` before the icon line was added).

## TDD evidence
None. The brief for this task has no test: it is configuration, JSX and fetch wiring, and its Step 3 and Step 4 are the typecheck, build and browser check above. The pure logic these files consume (`initialTimeZone` and the formatters) was already tested in Tasks 2 and 9.

## Files changed
`index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`, `package-lock.json`, `src/web/index.css`, `src/web/main.tsx`, `src/web/App.tsx`, `src/web/api.ts`, `src/web/hooks.ts`, `src/web/ui.tsx`, `src/web/ConfirmationPage.tsx`.

## Self-review and concerns
- **`Avatar` is an extra export in `ui.tsx`** (the brief lists four pieces). I added it because both the confirmation page and the mentors page (Task 12) show initials, so Task 12 can reuse it instead of re-implementing. Drop it if you'd rather keep ui.tsx to the four listed.
- **The primary-button classes are inline** (`rounded-cta bg-brand text-ink`, full width, 14px bold, `py-4`) on the "Join class" link. Task 11 will have two more of them ("Choose a time", "Confirm ..."). I didn't export a shared class string because the brief doesn't list one. Extract it in Task 11 if you want it DRY.
- **`/` shows the not-found card until Task 11 adds the booking page**, and the header's wordmark and the not-found card's home link both point to `/`.
- **`DemoBanner` is only exported.** Nothing renders it yet: it needs `now` and `demo` from the slots query, so the booking page (Task 11) and the mentors page (Task 12) should render it. The confirmation page doesn't fetch slots, so it shows no banner.
- **The focus outline is brand yellow, as the brief says.** It has low contrast against the white card and the #FAFAFA page (about 1.7:1). On the yellow CTA the 2px offset keeps it visible, but it is weak elsewhere. A decision for you or the author; I followed the brief.
- **The "Join class" link opens in a new tab.** That is my choice, since it is an external meeting link.
- **The `retry` rule treats network failures as retryable.** It does so via the 503 wrapping in `api.ts`, which is my addition. Mutations don't retry, so a failed booking POST surfaces once.

---

# Fix round 1

Commit: `fcab9c2 fix(web): ink focus ring for contrast, reject non-json success, share not-found and button styles` (5 files, no trailer).

## What changed
1. **Focus ring** (`src/web/index.css`): `:focus-visible` is now a 2px `--color-ink` outline, 2px offset, with a `0 0 0 4px var(--color-brand)` box-shadow halo. A comment says why it is ink and not brand (brand on white is 1.78:1, under WCAG 1.4.11's 3:1).
2. **2xx with a non-JSON body** (`src/web/api.ts`): when `res.ok` and the body didn't parse, `request` throws `new ApiError(502, 'INTERNAL', 'Unexpected response from the server.')`. Since 502 is at least 500, queries still retry it, and `ConfirmationPage` shows its error alert instead of loading forever.
3. **One not-found card** (`src/web/ui.tsx`, `App.tsx`, `ConfirmationPage.tsx`): `NotFoundCard({ title })` holds the h1 plus "Back to the home page" markup, and both places use it. Copy is unchanged ("We couldn't find that page." and "We couldn't find that booking."). In `ConfirmationPage` the 404 check now returns `NotFoundCard` before the loading/error card.
4. **Shared button classes** (`src/web/ui.tsx`): `export const primaryButton = 'block w-full rounded-cta bg-brand py-4 text-center text-sm font-bold text-ink'`, the same classes as before. "Join class" uses it as `` `mt-6 ${primaryButton}` ``.

## Commands and output
- `npm run typecheck && npm run build`: exit 0. `dist/web/index.html`, `assets/index-*.css` 10.79 kB, `assets/index-*.js` 258.56 kB.
- `npm test` (UTC, Pacific/Chatham, America/Los_Angeles): `Test Files 8 passed (8)`, `Tests 107 passed (107)` in each of the three zones.
- Behaviour check of the `api.ts` change: a throwaway script in the scratchpad (not in the repo) stubbed `fetch` and called the real `api.ts` under Node's type stripping:
  ```
  200 html  -> ApiError 502 INTERNAL "Unexpected response from the server."
  200 json  -> resolved {"now":"x","demo":false,"slots":[]}
  404 json  -> ApiError 404 NOT_FOUND "No such booking."
  502 text  -> ApiError 502 INTERNAL "Something went wrong. Please try again."
  ```
- Browser (Playwright, `npm run dev:server` and `npm run dev`; both now stopped by PID, ports 3000 and 5173 free, `db` and `mailpit` still up and healthy):
  - After three Tabs, "Join class" had computed `outline: rgb(47, 79, 79) solid 2px`, `outline-offset: 2px` and `box-shadow: rgb(251, 182, 0) 0 0 0 4px`. The screenshot `.playwright-mcp/confirmation-focus.png` shows a clear dark-teal ring around the button.
  - A made-up booking id and `/nope` still show their not-found copy with the home link.

## Self-review
- No raw hex, `useMemo`, `useCallback`, `useOptimistic` or `useEffect` in `src/web`.
- `body === null` also catches a literal JSON `null` on a 2xx. The API never sends one, so treating it as unexpected is right.
- `primaryButton` carries no disabled styling. Task 11 should add its own `disabled:` variants where it uses the string on a `<button>`.
- Slip: while stopping the servers I put one extra, unrelated PID (`5986`) in a `kill` command by mistake. It had no connection to this work, it isn't running now, and the `db` and `mailpit` containers are unaffected, but I can't prove what, if anything, it hit.
