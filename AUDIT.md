# Mod audit

Audited 2026-10-17. Method: full source read over GitHub by three review agents, then a local
grep of the cloned code below as a second method. Nothing installed during the audit.

## Pinned commits

| Mod | Repo | Path installed | SHA | Commit date | Licence |
|---|---|---|---|---|---|
| Savvy Progress | JohnnyVizz/claude-kit | `plugins/savvy-progress` | c871c15 | 2026-10-13 | MIT |
| Claude Skins | hellosverre/claude-skins | repo root | c2bd36f | 2026-10-17 | MIT |
| Filetree | data-goblin/claude-code-filetree | repo root | 1b3e72c | 2026-10-16 | MIT |
| Cache Tax | karanb192/cache-tax | repo root | 06cac47 | 2026-10-04 | MIT |
| Blast Radius | anthropics/claude-code-playground | `claude-code/mods/blast-radius` | 569c528 | 2026-10-01 | Apache-2.0 |
| Reflect | BayramAnnakov/claude-reflect | `mod` | b6c4232 | 2026-10-02 | MIT |
| You Should Know | built into Claude Code | n/a | ships with 2.1.296 | n/a | Anthropic |

## Local grep (second method)

Searched every non-test `.ts/.tsx/.mjs/.js` for `$.http`, `$.process`, `$.fs` writes,
`$.model`, `fetch(`, `eval(`, `new Function`, `child_process` and URLs.

| Mod | Hits | Matches the agent audit? |
|---|---|---|
| Savvy Progress | none (SVG namespace URL only) | yes |
| Claude Skins | 1 `$.http.fetch` (own plugin.json on GitHub), 1 `$.process.run` (dark-mode probe) | yes |
| Filetree | 13 `$.process.run` (git, find, du, launchers) | yes |
| Cache Tax | 1 `$.model.fork` (keep-warm ping) | yes |
| Blast Radius | 13 `$.process.run` (bash, git, migration listers) | yes |
| Reflect | 1 `$.model.complete` (Haiku check), 1 `$.fs.write` (CLAUDE.md on Save) | yes |

No MCP servers, no command hooks, no install scripts in any manifest.

## Verdicts

| Mod | Verdict | Notes that matter |
|---|---|---|
| Savvy Progress | Safe, notes | Appends a step-report brief to `savvy-*` subagent prompts |
| Claude Skins | Safe, notes | Version-check GET, `reg query` every 5s in `auto` theme, small chart hint in system prompt |
| You Should Know | Safe | Side agent bills plan usage per check |
| Filetree | Safe, notes | Terminal only. Selected file names enter model context unescaped. Windows open uses ShellExecute |
| Cache Tax | Safe, notes | Author's marketplace entry is unpinned. Keep-warm pings cost plan usage. Auto-arms 3h after a cold miss |
| Blast Radius | Safe, notes | Heuristic, not a sandbox. Migration listers run project code before approval. Needs Git Bash on this machine |
| Reflect | Safe, notes | Prompt + reply tail go to Haiku. `HOME` unset on Windows breaks the global save path. Global CLAUDE.md is a sync target |
