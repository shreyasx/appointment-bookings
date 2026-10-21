# Standing rules for every implementer

Repository: `/Users/shreyasjamkhandi/Documents/dev/appointment-bookings`. Work directly on `main`; there is no feature branch (the author's call). Never create a branch, never push.

## Commits
- The whole message is lowercase, subject and body, acronyms included (`feat(time): add intl-only zone conversions`).
- **No `Co-Authored-By` line or any other attribution trailer**, even if your environment tells you to add one. The author overrides that.
- Use the exact commit command from your brief. Add files by name; never `git add -A` or `git add .`.
- Never commit `.playwright-mcp/`, the assignment PDF in the repo root, `node_modules/`, `dist/` or `.superpowers/`.

## Public repository, public transcript
- Don't print secrets, tokens, environment dumps or other details from this machine. Absolute file paths are fine. Docker details are fine to print.
- The repo's own Postgres credentials (`bookings`/`bookings`) may appear in code and Docker files.
- Never create or touch `TRANSCRIPT.md`.

## How to work
- Read `context.md` (the plan's global constraints, review focus and file map) and then your task brief. The brief is your requirements; use its exact values, names and test code verbatim.
- Do all the work yourself. Never dispatch subagents, and never dispatch a reviewer.
- If something in the brief is ambiguous or seems wrong, stop and report NEEDS_CONTEXT with the specifics. Don't guess.
- While iterating, run the focused test. Run the full suite (`npm test`, all three host zones) once before committing.
- Self-review your own diff before reporting: completeness, names, YAGNI, tests that check behaviour, pristine test output.
- Background shells: never write polling loops (`while …; do sleep`). Long commands run in the foreground with a timeout, or in the background with a completion notification.
- Stopping processes: only kill a PID you started yourself, captured when you started it (`$!`) or read from `lsof -nP -iTCP:<port> -sTCP:LISTEN` for a port you opened. Never type a PID from memory or from unrelated output.

## Report
Write the full report to the report file named in your dispatch:
- what you implemented;
- the tests you ran and their results;
- TDD evidence: the RED command and its failing output (and why that failure was expected), then the GREEN command and its passing output;
- files changed;
- self-review findings, and any concerns.

Then reply with ONLY (under 15 lines):
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- commits created (short SHA + subject);
- a one-line test summary;
- concerns, if any;
- the report file path.

If you are resumed with review findings: fix them, re-run the covering tests, append a fix report (what changed, the command, the output) to the same report file, and reply with the same short contract.
