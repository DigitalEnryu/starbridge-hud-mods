# Starbridge HUD mods

A command deck above your Claude Code prompt, plus the community mods it works with, installed in one step.

```
/plugin install starbridge --marketplace DigitalEnryu/starbridge-hud-mods
```

Type that in Claude Code (2.1.287 or newer), then start a new session or run `/reload-plugins`. Installing Starbridge
also installs the three mods below it.

## What you get

| Mod | What it does | By |
|---|---|---|
| **Starbridge HUD** | Context gauge with a 50% handover notch, live cost chips, Keep warm toggle, cold-cache hold card, animated agents key, one-click Handover and End session | DigitalEnryu (MIT) |
| **Savvy Progress** | The agents panel: every subagent's model, progress, context, cost and time. Starbridge's mascot key opens it | JohnnyVizz (MIT, unmodified) |
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

- **Blast Radius was removed on 2026-10-18.** Installed it from here before then? Remove it with
  `/plugin uninstall blast-radius@starbridge-hud`. New installs no longer include it.
- **Mods run with your permissions.** Every third-party mod here was source-audited before inclusion; see
  [AUDIT.md](AUDIT.md). Vendored copies are listed in [vendor/README.md](vendor/README.md), forks carry a `CHANGES.md`.
- **Remove everything:** `/plugin uninstall starbridge@starbridge-hud`, then the same for each mod above.

## Notes for mod builders

Things learned building Starbridge that the docs do not spell out. Checked on Claude Code 2.1.296 to 2.1.299.

**The engine**

- One hook per event per plugin. A second `on('ui.render', ...)` in the same plugin stops it loading: fold the
  extra behaviour into the existing hook.
- Pass `$` only to functions declared in the same file. Handing it to an imported helper also stops the load.
- In the desktop app a session starts before any surface attaches, so decide whether you have a band on the first
  `ui.render`, not in `session.start`.
- `"dependencies"` in a plugin's `plugin.json` makes one install pull in other plugins from the same marketplace.
  That is how this repo installs four mods with one command.

**Drawing on the desktop**

- Native `Button`s draw their label only: colours and children are ignored. For a styled key, draw it as an `Svg`
  and lay an invisible `Client` over it for hover and clicks.
- Make the key's box exactly its visible face, and stretch the `Client` over that box (`position="absolute"`,
  all four offsets 0, `width="100%"` and `height="100%"`). Art that should reach past the face, such as sparks or a
  jumping character, goes in a taller `Svg` hung from the face's bottom edge (`position="absolute" bottom={0}`).
  The pointer on it falls to its parent, so it never takes a click.
- In a row that runs short of room, `Svg`s shrink. Give keys `flexShrink={0}` and let something else give way,
  or every key changes size when the content beside it changes.
- SMIL animation plays only in an `Svg` with `isInteractive`. A plain one is drawn as a still image.
- A `Box` border inside a `Client` costs a whole text row above and below, three rows in all.
- Emoji keep their own colours, so a greyed-out emoji is not possible. Spell the state in words, or draw the
  icon yourself.

**Testing and checking**

- `$.ui.ask` reaches tests as a `tool.call` of `AskUserQuestion`, not as an event of its own: mock it there.
- To check visuals without the app, render the real SVG output in a page and screenshot it with a headless
  browser (`msedge --headless=new --screenshot=out.png page.html`). To capture one moment of an animation, call
  `pauseAnimations()` and `setCurrentTime(t)` on each `svg` before the shot.
- Check any price table against the official model pricing on every model release. Copying one from another mod
  is how stale prices get in.

## Licence

Starbridge is MIT. Each other mod keeps its own licence and author credit in its folder.
