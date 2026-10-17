# Starbridge HUD mods

A command deck above your Claude Code prompt, plus the community mods it works with, installed in one step.

```
/plugin install starbridge --marketplace DigitalEnryu/starbridge-hud-mods
```

Type that in Claude Code (2.1.287 or newer), then start a new session or run `/reload-plugins`. Installing Starbridge
also installs the four mods below it.

## What you get

| Mod | What it does | By |
|---|---|---|
| **Starbridge HUD** | Context gauge with a 50% handover notch, live cost chips, Keep warm toggle, cold-cache hold card, animated agents key, one-click Handover and End session | DigitalEnryu (MIT) |
| **Savvy Progress** | The agents panel: every subagent's model, progress, context, cost and time. Starbridge's mascot key opens it | JohnnyVizz (MIT, unmodified) |
| **Blast Radius** | Holds risky shell commands (`rm -rf`, force pushes, resets) and lists exactly what they would change before you approve | Anthropic (Apache-2.0), with Windows fixes |
| **Reflect** | Spots corrections like "no, use pnpm" and offers to save them as a rule in your repo's `CLAUDE.md` | Bayram Annakov (MIT), with a Windows fix and global saves off by default |
| **Filetree** | Your project's file tree beside the chat, lighting up as Claude works. Terminal only (`/tui fullscreen`, 110+ columns) | Kurt Buhler (MIT, unmodified) |

Optional, built into Claude Code: **You Should Know**, a side agent that flags what you might miss.

```
/plugin enable cc-plugin-you-should-know@builtin
```

## Starbridge at a glance

```
[ gauge ▓▓▓▓▓▓▓▓░░░░░░░░│░░░░░░░░░░░░░░ 37% ]
[This session ≈$4.12] [Next turn, warm $0.03] [If it goes cold $0.52]   [👾] [🔥 Off] [▶ Handover] [■ End session]
```

- **Gauge.** How full the context window is. Teal, then gold past the 50% notch, red near the end.
- **Cost chips.** The session's cost so far, and what your next turn costs while the prompt cache is warm or once it
  has gone cold. Figures are API list-price estimates; on a subscription they show what the usage is worth.
- **👾 Agents.** A pixel mascot looping through 12 poses. Click to open the agents panel.
- **🔥 Keep warm.** Off in every new session. On, it sends a one-word ping about every 50 idle minutes so the one-hour
  cache never goes cold, and shows how many times it kept you warm and what that cost.
- **▶ Handover.** Asks first, then sends `handover`. When the reply ends with a fenced resume prompt and the line
  `Run /clear, paste this in the new session`, Starbridge runs `/clear` and sends the resume prompt for you. Built for
  the [end-session](https://github.com/DigitalEnryu/end-session) skill, which prints exactly that.
- **■ End session.** Asks first, then sends `end session`. No `/clear`.
- **Hold card.** A message sent after the cache went cold, in a conversation over 50k tokens, is held once with its
  price: Send, Edit message, or Cancel.

Commands: `/starbridge` (status), `/starbridge warm on|off`, `/starbridge preview 64 warm hold` (show any state with
made-up figures; `preview off` to return), `/starbridge buttons custom|flat|native`.

## Notes

- **Windows:** Blast Radius needs Git Bash installed; it finds it at its default path.
- **Mods run with your permissions.** Every third-party mod here was source-audited before inclusion; see
  [AUDIT.md](AUDIT.md). Vendored copies are listed in [vendor/README.md](vendor/README.md), forks carry a `CHANGES.md`.
- **Remove everything:** `/plugin uninstall starbridge@starbridge-hud`, then the same for each mod above.

## Licence

Starbridge is MIT. Each other mod keeps its own licence and author credit in its folder.
