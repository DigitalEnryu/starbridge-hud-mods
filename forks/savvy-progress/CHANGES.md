# Fork changes

Forked from JohnnyVizz/claude-kit `plugins/savvy-progress` at c871c15 (MIT, copyright kept in LICENSE).

## 1.2.1-fork.1 (2026-10-17)

- A second row above the prompt, always drawn: a context bar for this session with a line at 50%,
  green under it, amber past it, red from 80%. Figures come from `session.measure` and
  `$.session.usage()`.
- **Handover** button: a confirm dialog, then sends `handover`. When the end-session skill's
  answer ends with its resume prompt and the line "Run /clear, paste this in the new session",
  the mod runs `/clear` and sends the resume prompt into the fresh session.
- **End session** button: a confirm dialog, then sends `end session`. No `/clear`.
- A started run lapses after 30 minutes or 3 finished turns without a resume prompt, so a later
  reply can never trigger a surprise `/clear`. The ✕ beside "handover running" cancels it.
- Code: fork additions are marked "Fork addition" in `hooks/register.tsx`; pure helpers live in
  `hooks/session-logic.ts`; tests in `hooks/session-row.test.tsx`.
