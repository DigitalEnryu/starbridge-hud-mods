# Starbridge HUD

```
/plugin install starbridge --marketplace DigitalEnryu/starbridge-hud-mods
```

The command deck above your Claude Code prompt. One band, three jobs:

- **Gauge.** How full the context window is, with the percentage riding the fill and a notch at 50%,
  the point to think about handing over. Colour runs teal, gold, red as it fills.
- **Cost.** What this session has cost, what your next turn costs while the cache is warm, and what
  it costs if the cache goes cold. Figures are API list-price estimates.
- **Controls.**
  - 🔥 **Keep warm.** Off in every new session. On, it sends a one-word ping about every 50 idle
    minutes so the one-hour prompt cache never goes cold. Shows how often it kept you warm and what
    that cost.
  - **Handover.** Asks first, then runs your `handover` skill. When the skill prints its resume prompt
    and the line "Run /clear, paste this in the new session", Starbridge runs `/clear` and sends the
    resume prompt into the fresh session for you.
  - **End session.** Asks first, then runs `end session`. No `/clear`.

When you send a message after the cache went cold, and the context is over 50k tokens, Starbridge
holds it once and shows what sending it now costs against a warm turn: **Send**, **Edit message**,
or **Cancel**.

**Your own mascot.** The agents key shows a little pixel crew by default. To put your own character
there, save an animated SVG as `~/.claude/starbridge/mascot.svg`: 50 pixels wide, 42 to 120 tall, with
the key's face along its bottom 30 pixels, and at most 128 KB. Draw it with shapes: the desktop shows it in
a locked-down frame that leaves embedded pictures (`<image>`) blank. Starbridge reads it when a session starts;
`/starbridge mascot` reads it again after you change it. It lives outside
the plugin, so your art never ships with it.

`/starbridge` prints the status; `/starbridge warm on` and `/starbridge warm off` switch Keep warm.

Works in the Claude Code desktop app (drawn as a crisp SVG deck) and the terminal (drawn in cells).
Requires Claude Code 2.1.287 or newer.
