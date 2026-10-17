# Fork changes

Forked from anthropics/claude-code-playground `claude-code/mods/blast-radius` at 569c528
(Apache-2.0, Anthropic copyright header kept in `hooks/blast-radius.mjs`).

## 0.1.0-fork.1 (2026-10-17)

Windows fixes only; behaviour elsewhere is unchanged.

- Finds bash once: `bash` on PATH if it runs, else Git Bash at its default install path.
  `BLAST_RADIUS_BASH` overrides it.
- The hold loop's wait runs `sleep` inside that bash (Windows has no `sleep` on PATH).
- Both measuring scripts put `/usr/bin` first on PATH, so Git's `find` and `du` are used, never
  Windows `find.exe`.
- The `cd` resolver prints `pwd -W` (a Windows path such as `C:/x`, usable as a process folder)
  and falls back to `pwd -P` elsewhere. This fixes "could not measure" after `cd /full/path &&`.
