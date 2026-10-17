# Fork changes

Forked from BayramAnnakov/claude-reflect `mod` at b6c4232 (MIT, copyright kept in LICENSE).

## 3.3.0-fork.1 (2026-10-17)

- The global save path falls back to `USERPROFILE` when `HOME` is unset (the Windows default).
- New option `allowGlobal`, off by default: every rule saves to this repo's `CLAUDE.md` and the
  "Global instead" button is hidden. The global `CLAUDE.md` is a live sync target here.
- Known upstream issue, not caused by the fork: on Claude Code 2.1.296, 4 of upstream's own 10
  tests fail on both the original and the fork, including Save into an existing `CLAUDE.md`.
  Check Save live before relying on it.
