# Claude Mods

Rueben's Claude Code mods: audited third-party mods installed from pinned local clones, plus
our forks that add his own features. Created 2026-10-17. Plan of record:
`C:\Users\User\.claude\plans\c-users-user-downloads-9-claude-mods-gu-cuddly-emerson.md`.

## Registry

| Path | What it holds |
|---|---|
| `starbridge\` | **Starbridge HUD, ours** (MIT, DigitalEnryu). Written fresh, no copied code: context gauge, cost tiles, Keep warm, cold-cache hold card, Handover / End session. Replaces the Savvy fork's row and the Cache Tax fork |
| `_live-check\` | throwaway scratch folder for live button tests; delete any time |
| `AUDIT.md` | security verdict per mod, with the exact commit SHA audited |
| `upstream\` | pinned clones of the six source repos. 🔒 Never edited, never pulled without a re-audit |
| `forks\` | our modified copies (blast-radius, reflect-mod). Each keeps the original LICENSE and copyright line, plus `CHANGES.md`. The Cache Tax and Savvy forks were retired 2026-10-17 (Starbridge does their jobs); they live in git history |
| `vendor\` | unmodified copies of savvy-progress and filetree, so the public repo installs as one package. `vendor\README.md` lists source and commit |
| `.claude-plugin\marketplace.json` | marketplace `starbridge-hud`; installing `starbridge` pulls in the other four as declared dependencies. Rueben's machine installs from this folder |
| `README.md` | public front page of `DigitalEnryu/starbridge-hud-mods` |

## Rules

- 🔒 Upstream code reaches Rueben only through a pinned clone. Updating one = pull, re-run the
  local grep in `AUDIT.md`, record the new SHA, then reinstall.
- 🔒 Forks keep the original author's copyright line. Clean-room "ours" versions for publishing
  are Phase 3 and start in a separate folder, never by stripping names from a fork.
- `upstream\` is git-ignored here: each clone has its own history.

## Session-End Contract
- log: `learning-log.md`
- format: standard
- append: bottom
- open-cap: 20 · promotion after 3 recurrences into this file
- hygiene-allowed: curate this log
- never-touch: `upstream\` (pinned audited code), `AUDIT.md` rows once written (append only)
