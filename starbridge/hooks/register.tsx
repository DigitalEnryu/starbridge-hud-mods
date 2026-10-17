// Starbridge HUD: the command deck above the prompt.
//
//   gauge   how full the context window is, with a notch at the 50% handover line
//   tiles   what the session has cost, and what the next turn costs warm or cold
//   buttons Keep warm (pings the cache before it goes cold), Handover, End session
//   card    a message sent after the cache went cold is held until the person chooses
//
// The host reads `on(...)` and `$.noun.method(...)` from source, so helpers that take `$`
// are top-level functions in this file and every `$` call is spelled out.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode } from 'claude-code'

import type { SessionRun, View } from '../types'
import {
  blankSvg, crewKeySvg, DARK, extractResume, GAUGE_H, glowSvg, GLOW_LIT, GLOW_REST, KEY_CANVAS_H, KEY_H, keySvg, TILE_H, fmtDuration, fmtUsd, gaugeSvg, gaugeText, holdCardSvg, HOLD_MIN_TOKENS, isCold, isRunLive,
  LIGHT, PING_EVERY_MS, PING_PROMPT, pingUsd, priceOf, coldUsd, warmUsd, shortened, stripWidth, tilesSvg, TTL_MS,
} from './logic'
import type { Tile } from './logic'

/** Roughly the room the desktop leaves between two items of a row, in CSS pixels. */
const ROW_GAP_PX = 14

const IDLE_RUN: SessionRun = { mode: null, turns: 0, startedAt: 0 }
const FRESH: View = {
  percent: null, tokens: null, window: null, sessionUsd: null, model: null, lastRequestAt: 0,
  warmOn: false, pings: 0, pingUsd: 0, saves: 0, savedUsd: 0, nextPingAt: 0, stopped: null, hold: null, run: IDLE_RUN,
}

const view = atom({ plugin: 'starbridge', key: 'view' } as const, FRESH)
const tick = atom({ plugin: 'starbridge', key: 'tick' } as const, 0)

const RESUME_KEY = 'resume'
const ASK_HANDOVER = 'This ends with /clear and a fresh session started from the resume prompt. Run handover now?'
const ASK_END = 'This logs learnings and tidies, with no /clear. Run end session now?'
const YES_HANDOVER = 'Run handover'
const YES_END = 'Run end session'
const NO = 'Cancel'

// Timers and guards live in the module: they need no redraw, and a reload starts them over.
let timer: { cancel: () => void } | null = null
let isTaking = false
let isLight = false
let lastUserAt = 0
// `/starbridge preview ...` dresses the drawing up to show a state on demand; it never touches the real view.
let preview: { percent?: number; warm?: boolean; hold?: boolean } | null = null
// The desktop draws Starbridge's own tinted buttons (deck-button.ts); `/starbridge buttons native`
// falls back to the app's plain ones.
let buttonStyle: 'custom' | 'flat' | 'native' = 'custom'
// Which of Starbridge's keys the pointer is over, and how far each key's glow has faded in: 0 at rest,
// 1 fully lit. The glow steps toward its target on a short timer, turning round from wherever it is
// when the pointer comes and goes quickly. Only the glow layer redraws; the key art never does.
let hovered: string | null = null
const glowLevel: Record<string, number> = {}
let glowTimer: { cancel: () => void } | null = null
const GLOW_TICK_MS = 30
const GLOW_IN_STEP = 0.2 // full in 150ms
const GLOW_OUT_STEP = 0.125 // back to rest in 240ms

type DeckSpec = {
  key: string; action: string; glyph?: string; glyphColor?: string; label: string
  fg: string; bg: string; hoverBg: string; edge?: string; hoverEdge?: string
}

// The deck's keys: outlined so they read as things to press, apart from the information chips.
const RED = '#ff4d5e'
const KEY_HANDOVER = { glyph: '▶', glyphColor: RED, fg: '#f4f3ee', bg: '#0f2219', hoverBg: '#153526', edge: '#2bf0a8', hoverEdge: '#8dffd6' }
const KEY_STOP = { glyph: '■', glyphColor: '#ffffff', fg: '#f4f3ee', bg: '#222220', hoverBg: '#2e2e2b', edge: '#a9a79f', hoverEdge: '#ffffff' }
const KEY_GOLD = { fg: '#ffc93c', bg: '#2b2208', hoverBg: '#3d300b', edge: '#ffc93c', hoverEdge: '#ffe08a' }
const KEY_QUIET = { fg: '#c9c7bf', bg: '#222220', hoverBg: '#2e2e2b', edge: '#5d5c57', hoverEdge: '#a9a79f' }

/** Cells a label takes: an emoji is two wide. */
function cellsOf(label: string): number {
  let n = 0
  for (const ch of label) n += (ch.codePointAt(0) ?? 0) >= 0x1f000 ? 2 : 1
  return n
}

function dressed(v: View, now: number): View {
  if (!preview) return v
  const out: View = { ...v }
  if (preview.percent !== undefined) out.percent = preview.percent
  if (preview.warm) Object.assign(out, { warmOn: true, pings: 3, pingUsd: 0.06, saves: 1, savedUsd: 1.56, nextPingAt: now + 41 * 60000, stopped: null })
  if (preview.hold) Object.assign(out, { tokens: 52000, model: out.model ?? 'opus-5', lastRequestAt: now - 72 * 60000, hold: { text: 'Where were we? Give me a 2 line recap.', at: now } })
  return out
}

// ---- Hover glow ------------------------------------------------------------------------------

/** One step of every moving glow toward its target, then another step in a moment while any still moves. */
function stepGlow($: EngineInterface): void {
  glowTimer = null
  let isMoving = false
  for (const action of new Set([...Object.keys(glowLevel), ...(hovered ? [hovered] : [])])) {
    const target = hovered === action ? 1 : 0
    const at = glowLevel[action] ?? 0
    if (at === target) continue
    const next = target > at ? Math.min(1, at + GLOW_IN_STEP) : Math.max(0, at - GLOW_OUT_STEP)
    glowLevel[action] = Math.round(next * 1000) / 1000
    if (glowLevel[action] !== target) isMoving = true
  }
  $.ui.invalidate('ui.render')
  if (isMoving) glowTimer = $.clock.after(GLOW_TICK_MS, () => stepGlow($))
}

/** The glow layer's opacity for a key: rest, lit, or on the way between. */
function glowOpacity(action: string): number {
  return Math.round((GLOW_REST + (GLOW_LIT - GLOW_REST) * (glowLevel[action] ?? 0)) * 1000) / 1000
}

// ---- Keep warm -------------------------------------------------------------------------------

function disarm() {
  if (timer) timer.cancel()
  timer = null
}

async function arm($: EngineInterface): Promise<void> {
  disarm()
  const v = await read($, view)
  if (!v.warmOn || v.lastRequestAt === 0) return
  const now = await $.clock.now()
  if (isCold(v.lastRequestAt, now)) {
    await update($, view, prev => ({ ...prev, nextPingAt: 0, stopped: 'cache already cold; warms again after your next message' }))
    return
  }
  const delay = Math.max(1000, v.lastRequestAt + PING_EVERY_MS - now)
  timer = $.clock.after(delay, () => void ping($))
  await update($, view, prev => ({ ...prev, nextPingAt: now + delay, stopped: null }))
}

async function ping($: EngineInterface): Promise<void> {
  timer = null
  const v = await read($, view)
  if (!v.warmOn) return
  const now = await $.clock.now()
  if (isCold(v.lastRequestAt, now) || now - v.lastRequestAt < PING_EVERY_MS - 1000) return arm($)
  let r
  try {
    r = await $.model.fork({ prompt: PING_PROMPT })
  } catch (err) {
    return stopWarm($, `ping failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!r.isAnswered) return stopWarm($, r.reason === 'nothing-to-fork' ? 'nothing to keep warm yet' : 'ping failed')
  const u = r.usage
  const price = priceOf(v.model)
  const cost = price ? pingUsd(u, price) : 0
  const warm = u.cache_read_input_tokens > 0 && u.cache_creation_input_tokens < 0.1 * u.cache_read_input_tokens
  await update($, view, prev => ({ ...prev, pings: prev.pings + 1, pingUsd: prev.pingUsd + cost }))
  if (!warm) return stopWarm($, 'the cache had already gone')
  await update($, view, prev => ({ ...prev, lastRequestAt: now }))
  await arm($)
}

async function stopWarm($: EngineInterface, why: string | null): Promise<void> {
  disarm()
  await update($, view, prev => ({ ...prev, warmOn: false, nextPingAt: 0, stopped: why }))
}

async function toggleWarm($: EngineInterface): Promise<void> {
  const v = await read($, view)
  if (v.warmOn) return stopWarm($, null)
  await update($, view, prev => ({ ...prev, warmOn: true, stopped: null }))
  await arm($)
}

// ---- Handover and end session ----------------------------------------------------------------

/** The mascot key: opens the agents panel (Savvy Progress's /agents-info) to the front. */
async function openCrew($: EngineInterface): Promise<void> {
  try {
    await $.command.run({ command: 'agents-info', args: 'open' })
  } catch {
    void $.ui.toast('The agents panel needs the Savvy Progress mod.')
  }
}

async function startRun($: EngineInterface, mode: 'handover' | 'end'): Promise<void> {
  const isHandover = mode === 'handover'
  // A dismissed dialog rejects: that is a Cancel too.
  const pick = await $.ui
    .ask(isHandover ? ASK_HANDOVER : ASK_END, {
      options: [isHandover ? YES_HANDOVER : YES_END, NO],
      header: isHandover ? 'Handover' : 'End session',
    })
    .catch(() => NO)
  if (pick !== (isHandover ? YES_HANDOVER : YES_END)) return
  const at = await $.clock.now()
  await update($, view, prev => ({ ...prev, run: { mode, turns: 0, startedAt: at } }))
  void $.prompt.submit({ text: isHandover ? 'handover' : 'end session', asUser: true })
}

/** Sends the stored resume prompt once, into whatever conversation is live now. */
async function takeResume($: EngineInterface): Promise<void> {
  if (isTaking) return
  isTaking = true
  try {
    const text = await $.store.get(RESUME_KEY)
    if (typeof text !== 'string' || text.length === 0) return
    await $.store.delete(RESUME_KEY)
    void $.prompt.submit({ text, asUser: true })
  } finally {
    isTaking = false
  }
}

async function clearAndResume($: EngineInterface): Promise<void> {
  try {
    await $.command.run({ command: 'clear' })
  } catch {
    await $.prompt.submit({ text: '/clear', asUser: true })
  }
  await takeResume($)
}

async function watchRun($: EngineInterface, answer: string, isAnswer: boolean): Promise<void> {
  const v = await read($, view)
  const now = await $.clock.now()
  if (!isRunLive(v.run, now)) {
    if (v.run.mode !== null) await update($, view, prev => ({ ...prev, run: IDLE_RUN }))
    return
  }
  if (v.run.mode === 'end') {
    await update($, view, prev => ({ ...prev, run: IDLE_RUN }))
    return
  }
  const resume = isAnswer ? extractResume(answer) : null
  if (resume === null) {
    await update($, view, prev => ({ ...prev, run: { ...prev.run, turns: prev.run.turns + 1 } }))
    return
  }
  await $.store.set(RESUME_KEY, resume)
  await update($, view, prev => ({ ...prev, run: IDLE_RUN }))
  void $.ui.toast('Handover done. Jumping to a fresh session.')
  // Never from inside the turn: a command run from a hook the turn waits on is refused.
  $.clock.after(800, () => void clearAndResume($))
}

// ---- The hold card ---------------------------------------------------------------------------

async function sendHeld($: EngineInterface): Promise<void> {
  const v = await read($, view)
  if (!v.hold) return
  const text = v.hold.text
  await update($, view, prev => ({ ...prev, hold: null }))
  // A plugin's submission is never held, so this goes straight through.
  void $.prompt.submit({ text, asUser: true })
}

async function editHeld($: EngineInterface): Promise<void> {
  const v = await read($, view)
  if (!v.hold) return
  const text = v.hold.text
  const filled = await $.prompt.fill({ text, mode: 'replace' }).catch(() => ({ isFilled: false }))
  // Keep the card if the box would not take the text, so the message is never lost.
  if (filled.isFilled) await update($, view, prev => ({ ...prev, hold: null }))
  else void $.ui.toast('The prompt box is busy. Your message is still on the card.')
}

async function dropHeld($: EngineInterface): Promise<void> {
  await update($, view, prev => ({ ...prev, hold: null }))
}

// ---- Readings --------------------------------------------------------------------------------

async function readUsage($: EngineInterface): Promise<void> {
  const usage = await $.session.usage().catch(() => null)
  if (!usage) return
  await update($, view, prev => ({
    ...prev,
    percent: usage.context.percent ?? prev.percent,
    tokens: usage.context.tokens ?? prev.tokens,
    window: usage.context.window || prev.window,
    sessionUsd: usage.cost?.usd ?? prev.sessionUsd,
  }))
}

async function readTheme($: EngineInterface): Promise<void> {
  const theme = (await $.config.list().catch(() => [])).find(row => row.key === 'theme')?.value
  isLight = typeof theme === 'string' && theme.startsWith('light')
}

function tilesOf(v: View, now: number): Tile[] {
  const tiles: Tile[] = []
  if (v.sessionUsd !== null) {
    const usd = `≈${fmtUsd(v.sessionUsd)}`
    tiles.push({ label: 'This session', value: usd, short: { label: 'Session', value: usd } })
  }
  const price = priceOf(v.model)
  if (v.warmOn) {
    const left = v.nextPingAt > now ? fmtDuration(v.nextPingAt - now) : ''
    const spent = `≈${fmtUsd(v.pingUsd)}`
    tiles.push({
      label: `Kept warm ${v.pings} time${v.pings === 1 ? '' : 's'}`, value: `${spent}${left ? ` · next ${left}` : ''}`, tone: 'hot',
      short: { label: `Warm ×${v.pings}`, value: `${spent}${left ? ` · ${left}` : ''}` },
    })
    if (v.saves > 0) {
      const saved = `≈${fmtUsd(Math.max(0, v.savedUsd - v.pingUsd))}`
      tiles.push({ label: 'Saved vs going cold', value: saved, tone: 'calm', short: { label: 'Saved', value: saved } })
    }
  } else if (price && v.tokens) {
    const warm = fmtUsd(warmUsd(v.tokens, price))
    const cold = fmtUsd(coldUsd(v.tokens, price))
    tiles.push({ label: 'Next turn, warm', value: warm, tone: 'calm', short: { label: 'Warm', value: warm } })
    tiles.push({ label: 'If it goes cold', value: cold, tone: 'hot', short: { label: 'If cold', value: cold } })
  }
  if (v.stopped) {
    const why = (n: number) => (v.stopped!.length > n ? `${v.stopped!.slice(0, n - 1)}…` : v.stopped!)
    tiles.push({ label: 'Keep warm stopped', value: why(34), short: { label: 'Warm off', value: why(18) } })
  }
  return tiles
}

/** Drops chips from the end until the strip fits `budget` pixels; the first chip always stays. */
function fitTiles(tiles: Tile[], budget: number): Tile[] {
  const out = [...tiles]
  while (out.length > 1 && stripWidth(out) > budget) out.pop()
  return out
}

/**
 * The chips to draw (`tiles`, perhaps in short words), the same chips in full words (`full`, for the
 * alt text) and the room they hold. The room is the wider of what Keep warm on and Keep warm off would
 * show, so a click on the key changes the words in the chips and never moves the row. When either
 * would overflow, both switch to short words, so toggling never trades one chip for another; only
 * a row too narrow even for those drops chips from the end.
 */
function stripOf(v: View, now: number, budget: number): { tiles: Tile[]; full: Tile[]; slot: number } {
  const asOn: View = { ...v, warmOn: true, nextPingAt: v.warmOn ? v.nextPingAt : now + PING_EVERY_MS }
  const asOff: View = { ...v, warmOn: false }
  const isShort = [asOn, asOff].some(x => stripWidth(tilesOf(x, now)) > budget)
  const words = (tiles: Tile[]) => (isShort ? tiles.map(shortened) : tiles)
  const slot = Math.min(budget, Math.max(...[asOn, asOff].map(x => stripWidth(fitTiles(words(tilesOf(x, now)), budget)))))
  const full = tilesOf(v, now)
  const tiles = fitTiles(words(full), budget)
  return { tiles, full: full.slice(0, tiles.length), slot }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await readTheme($)
    await readUsage($)
    // The model prices the warm and cold tiles from the first draw, before any reply has finished.
    const model = await $.session.model().catch(() => null)
    if (model) await update($, view, prev => ({ ...prev, model: prev.model ?? model }))
    await $.command.register({
      name: 'starbridge',
      description: 'Starbridge HUD: status, or warm on|off',
      argumentHint: '[status | warm on | warm off | preview 64 warm hold | preview off | buttons custom|flat|native]',
    })
    // Countdowns move once a minute; nothing else needs a clock.
    $.clock.every(60_000, () => {
      void (async () => {
        const at = await $.clock.now()
        await update($, tick, () => at)
      })()
    })
    return started
  })

  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) isLight = typeof result.value === 'string' && result.value.startsWith('light')
    return result
  })

  on('session.measure', async ($, e, next) => {
    await update($, view, prev => ({
      ...prev,
      percent: e.context.percent ?? prev.percent,
      tokens: e.context.tokens ?? prev.tokens,
      window: e.context.window || prev.window,
      sessionUsd: e.cost?.usd ?? prev.sessionUsd,
    }))
    return next(e)
  })

  // Each main-loop request reads the cache: its time is when the hour starts again.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      const at = await $.clock.now()
      await update($, view, prev => ({ ...prev, lastRequestAt: at }))
    }
    yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    const now = await $.clock.now()
    await update($, view, prev => ({
      ...prev,
      model: e.usage?.model || prev.model,
      lastRequestAt: now - prev.lastRequestAt > e.durationMs ? now : prev.lastRequestAt,
    }))
    await watchRun($, e.answer, e.reason === 'answer')
    await arm($)
    return result
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) {
      disarm()
      await update($, view, prev => ({ ...prev, lastRequestAt: 0, nextPingAt: 0 }))
    }
    return result
  })

  // A /clear starts a fresh conversation: Keep warm goes back to off, and a handover's resume prompt goes in.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if ((e as { source?: string }).source === 'clear') {
      disarm()
      await update($, view, prev => ({ ...FRESH, model: prev.model, run: prev.run }))
      $.clock.after(1500, () => void takeResume($))
    }
    return result
  })

  // The message that would pay a cold re-read is held once, with its price, until the person chooses.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'composer' || e.command || e.text.trimStart().startsWith('/')) return next(e)
    const v = await read($, view)
    const now = await $.clock.now()
    const gap = lastUserAt > 0 ? now - lastUserAt : 0
    lastUserAt = now
    const cold = isCold(v.lastRequestAt, now)
    if (!cold && v.warmOn && v.pings > 0 && gap >= TTL_MS) {
      // Keep warm carried this idle stretch: without it, this message would have paid the cold price.
      const price = priceOf(v.model)
      const saved = price && v.tokens ? coldUsd(v.tokens, price) - warmUsd(v.tokens, price) : 0
      await update($, view, prev => ({ ...prev, saves: prev.saves + 1, savedUsd: prev.savedUsd + saved }))
    }
    if (!cold || (v.tokens ?? 0) < HOLD_MIN_TOKENS || !priceOf(v.model)) return next(e)
    await update($, view, prev => ({ ...prev, hold: { text: e.text, at: now } }))
    return { drop: 'Starbridge is holding this message: the cache went cold. Choose on the card above the prompt.' }
  })

  // A click on one of Starbridge's own buttons (deck-button.ts) arrives here.
  on('ui.message', async ($, e, next) => {
    const data = e.data as { action?: unknown; hover?: unknown } | null
    if (data && 'hover' in data) {
      const next_ = typeof data.hover === 'string' ? data.hover : null
      if (next_ !== hovered) {
        hovered = next_
        // A fade already under way picks up the new target on its next step.
        if (!glowTimer) stepGlow($)
      }
    }
    const action = data?.action
    if (action === 'warm') void toggleWarm($)
    else if (action === 'handover') void startRun($, 'handover')
    else if (action === 'end') void startRun($, 'end')
    else if (action === 'send') void sendHeld($)
    else if (action === 'edit') void editHeld($)
    else if (action === 'drop') void dropHeld($)
    else if (action === 'crew') void openCrew($)
    return next(e)
  })

  on('command.run', { command: 'starbridge' }, async ($, e) => {
    const words = String(e.args ?? '').trim().split(/\s+/).filter(Boolean)
    if (words[0] === 'buttons' && (words[1] === 'custom' || words[1] === 'flat' || words[1] === 'native')) {
      buttonStyle = words[1]
      $.ui.invalidate('ui.render')
      return { text: `Starbridge buttons: ${words[1]}` }
    }
    if (words[0] === 'preview') {
      const rest = words.slice(1)
      if (rest.length === 0 || rest[0] === 'off') {
        preview = null
        $.ui.invalidate('ui.render')
        return { text: 'Preview off: the HUD shows this session again.' }
      }
      const pct = rest.map(Number).find(n => Number.isFinite(n) && n >= 0 && n <= 100)
      preview = { percent: pct, warm: rest.includes('warm'), hold: rest.includes('hold') }
      $.ui.invalidate('ui.render')
      return { text: 'Preview on (made-up figures). /starbridge preview off returns to this session.' }
    }
    if (words[0] === 'warm' && (words[1] === 'on' || words[1] === 'off')) {
      const v = await read($, view)
      if ((words[1] === 'on') !== v.warmOn) await toggleWarm($)
      return { text: `Keep warm is ${words[1]}` }
    }
    const v = await read($, view)
    const now = await $.clock.now()
    const lines = [
      `context   ${v.percent === null ? 'no reading yet' : `${v.percent}%`}`,
      `cache     ${v.lastRequestAt === 0 ? 'no request yet' : isCold(v.lastRequestAt, now) ? 'cold' : `warm for ${fmtDuration(v.lastRequestAt + TTL_MS - now)}`}`,
      `keep warm ${v.warmOn ? `on, kept warm ${v.pings} times, ≈${fmtUsd(v.pingUsd)}` : v.stopped ? `off (${v.stopped})` : 'off'}`,
      ...tilesOf(v, now).map(t => `${t.label}: ${t.value}`),
    ]
    return { text: lines.join('\n') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    // The engine's own placeholder is never nested: the desktop drops a band that nests it.
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    await read($, tick)
    const now = await $.clock.now()
    const v = dressed(await read($, view), now)
    const p = isLight ? LIGHT : DARK
    const busy = v.run.mode === 'handover' ? 'Handover running' : v.run.mode === 'end' ? 'End session running' : ''
    const price = priceOf(v.model)
    const tokens = v.tokens ?? 0
    const cols = e.props.bodyColumns || 100

    // The desktop's native button draws its label alone, so each icon lives in the label itself.
    // An emoji keeps its own colours, so Keep warm spells its state out.
    const flame = (
      <Button key="starbridge-warm" label={v.warmOn ? '🔥 On' : '🔥 Off'} onPress={() => void toggleWarm($)} />
    )
    const handover = busy ? null : (
      <Button key="starbridge-handover" label="▶ Handover" onPress={() => void startRun($, 'handover')} />
    )
    const end = busy ? null : <Button key="starbridge-end" label="■ End session" onPress={() => void startRun($, 'end')} />
    const crew = <Button key="starbridge-crew" label="👾 Agents" onPress={() => void openCrew($)} />
    const running = busy ? <Text color={p.hot}>{busy}</Text> : null
    const cancelRun = busy ? <Button key="starbridge-run-cancel" label="✕" plain onPress={() => update($, view, prev => ({ ...prev, run: IDLE_RUN }))} /> : null
    const tiles = tilesOf(v, now)
    const hold = v.hold && price
      ? { text: v.hold.text, idleMs: now - v.lastRequestAt, coldUsd: coldUsd(tokens, price), warmUsd: warmUsd(tokens, price), tokens }
      : null
    const holdButtons = hold ? (
      <Box flexDirection="row" gap={1}>
        <Button key="starbridge-send" variant="primary" label={`Send for ${fmtUsd(hold.coldUsd)}`} onPress={() => void sendHeld($)} />
        <Button key="starbridge-edit" label="Edit message" onPress={() => void editHeld($)} />
        <Button key="starbridge-drop" label="Cancel" onPress={() => void dropHeld($)} />
      </Box>
    ) : null

    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      if (buttonStyle === 'custom' && 'Client' in ui) {
        const { Client } = ui
        const flat = buttonStyle === 'flat'
        const key = (spec: DeckSpec): DeckSpec => (flat ? { ...spec, edge: undefined, hoverEdge: undefined } : spec)
        const specs: DeckSpec[] = [
          key({ key: 'starbridge-warm', action: 'warm', glyph: '🔥', label: v.warmOn ? 'On' : 'Off', ...(v.warmOn ? KEY_GOLD : KEY_QUIET) }),
          ...(busy ? [] : [
            key({ key: 'starbridge-handover', action: 'handover', label: 'Handover', ...KEY_HANDOVER }),
            key({ key: 'starbridge-end', action: 'end', label: 'End session', ...KEY_STOP }),
          ]),
        ]
        const holdSpecs: DeckSpec[] = hold ? [
          key({ key: 'starbridge-send', action: 'send', label: `Send for ${fmtUsd(hold.coldUsd)}`, ...KEY_GOLD }),
          key({ key: 'starbridge-edit', action: 'edit', label: 'Edit message', ...KEY_QUIET }),
          key({ key: 'starbridge-drop', action: 'drop', label: 'Cancel', ...KEY_QUIET }),
        ] : []
        // A key's region: the glyph and its space, the label, the padding, and the outline when drawn.
        const widthOf = (spec: DeckSpec) => (spec.glyph ? cellsOf(spec.glyph) + 1 : 0) + cellsOf(spec.label) + 2 + (spec.edge ? 2 : 0)
        const heightOf = (_spec: DeckSpec) => 1
        // A key is three layers over a blank that holds its place in the row, exactly the size of its face
        // (KEY_H): its glow, its art, and an invisible click area stretched over the face (all four
        // offsets, 100% each way), so the face, and only the face, takes a click. The glow and the art
        // hang from the face's bottom edge, out of the flow; art that reaches higher (the sparks, the
        // jumping mascot) is a KEY_CANVAS_H image, and the pointer on it is on the key's Box, which does
        // nothing. The art never changes under the pointer, so an animated key never redraws and never
        // restarts: hover fades the glow layer alone (stepGlow). Keys never shrink: chips give way (stripOf).
        const crewArt = crewKeySvg({ edge: '#d97757', bg: '#1f1a17' })
        const crewCells = Math.ceil(crewArt.width / 8)
        const pressable = (o: { key: string; action: string; alt: string; art: { svg: string; width: number; height: number }; isInteractive: boolean; glow: string; hit: RenderNode }) => (
          <Box key={`${o.key}-key`} position="relative" flexShrink={0}>
            <Svg key={`${o.key}-place`} source={blankSvg(o.art.width, KEY_H)} alt={`${o.alt} key`} width={o.art.width} height={KEY_H} />
            <Box position="absolute" bottom={0} left={0}>
              <Svg key={`${o.key}-glow`} source={glowSvg({ width: o.art.width, height: o.art.height, color: o.glow, opacity: glowOpacity(o.action) })} alt={`${o.alt} glow`} width={o.art.width} height={o.art.height} />
            </Box>
            <Box position="absolute" bottom={0} left={0}>
              <Svg key={`${o.key}-art`} source={o.art.svg} alt={o.alt} width={o.art.width} height={o.art.height} isInteractive={o.isInteractive} />
            </Box>
            <Box position="absolute" top={0} bottom={0} left={0} right={0}>
              {o.hit}
            </Box>
          </Box>
        )
        const crewKey = flat ? (
          <Client key="starbridge-crew" module="./deck-button.ts" props={{ key: 'starbridge-crew', action: 'crew', glyph: '👾', label: 'Agents', ...KEY_QUIET, edge: undefined }} width={10} height={1} />
        ) : pressable({
          key: 'starbridge-crew', action: 'crew', alt: 'Agents panel', art: { ...crewArt, height: KEY_CANVAS_H }, isInteractive: true, glow: '#d97757',
          hit: <Client key="starbridge-crew" module="./deck-button.ts" props={{ key: 'starbridge-crew', action: 'crew', label: 'Agents', ...KEY_QUIET, ghost: true, cells: crewCells }} width="100%" height="100%" />,
        })
        // Keep warm draws a flame of its own, and is sized for its longer label so On and Off match.
        const artOf = (spec: DeckSpec) => {
          const isWarm = spec.action === 'warm'
          return keySvg({
            glyph: spec.glyph, glyphColor: spec.glyphColor, label: spec.label, fg: spec.fg, bg: spec.bg, edge: spec.edge!,
            ...(isWarm ? { sizeAs: 'Off', flame: v.warmOn ? 'on' as const : 'off' as const } : {}),
          })
        }
        const deckKey = (spec: DeckSpec) => {
          if (flat || !spec.edge) {
            return <Client key={spec.key} module="./deck-button.ts" props={spec} width={widthOf(spec)} height={heightOf(spec)} />
          }
          const art = artOf(spec)
          const cells = Math.ceil(art.width / 8)
          // Keep warm is always a frame, lit or not, so switching it never swaps an image for a frame.
          return pressable({
            key: spec.key, action: spec.action, alt: spec.glyph ? `${spec.glyph} ${spec.label}` : spec.label, art,
            isInteractive: spec.action === 'warm' || art.isAnimated, glow: spec.hoverEdge ?? spec.edge,
            hit: <Client key={spec.key} module="./deck-button.ts" props={{ ...spec, ghost: true, cells }} width="100%" height="100%" />,
          })
        }
        const width = Math.max(240, Math.min(1400, cols * 8 - 24))
        const keysPx = (flat ? 0 : crewArt.width) + specs.reduce((sum, s) => sum + (flat || !s.edge ? widthOf(s) * 8 : artOf(s).width), 0)
        const budget = width - keysPx - ROW_GAP_PX * (specs.length + 2) - (busy ? busy.length * 7 + 40 : 0)
        const { tiles: shown, full, slot } = stripOf(v, now, budget)
        const strip = shown.length > 0 ? tilesSvg(shown, p, { slot }) : null
        return (
          <Box flexDirection="column" gap={1}>
            {/* The gap between gauge and row is where the sparks and the jumping mascot reach. */}
            <Svg source={gaugeSvg(v.percent, width, p)} alt={`Context ${v.percent ?? 0}% full`} width={width} height={GAUGE_H} />
            <Box flexDirection="row" alignItems="center" gap={1}>
              {strip ? (
                <Box flexShrink={1}>
                  <Svg source={strip.svg} alt={full.map(t => `${t.label} ${t.value}`).join(', ')} width={strip.width} height={TILE_H} />
                </Box>
              ) : null}
              <Box flexGrow={1} />
              {running}
              {cancelRun}
              {crewKey}
              {specs.map(deckKey)}
            </Box>
            {hold ? <Svg source={holdCardSvg(width, hold, p)} alt={`Message on hold. Send now ${fmtUsd(hold.coldUsd)}, a warm turn ${fmtUsd(hold.warmUsd)}.`} width={width} height={132} /> : null}
            {hold ? (
              <Box flexDirection="row" gap={1}>
                {holdSpecs.map(deckKey)}
              </Box>
            ) : null}
            {below}
          </Box>
        )
      }
      // About 8 CSS px a reported column, less a little for the slot's own padding.
      const width = Math.max(240, Math.min(1400, cols * 8 - 24))
      const strip = tiles.length > 0 ? tilesSvg(tiles, p) : null
      return (
        <Box flexDirection="column" gap={1}>
          <Svg source={gaugeSvg(v.percent, width, p)} alt={`Context ${v.percent ?? 0}% full`} width={width} height={GAUGE_H} />
          <Box flexDirection="row" alignItems="center" gap={1}>
            {strip ? <Svg source={strip.svg} alt={tiles.map(t => `${t.label} ${t.value}`).join(', ')} width={strip.width} height={TILE_H} /> : null}
            <Box flexGrow={1} />
            {crew}
            {flame}
            {running}
            {cancelRun}
            {handover}
            {end}
          </Box>
          {hold ? <Svg source={holdCardSvg(width, hold, p)} alt={`Message on hold. Send now ${fmtUsd(hold.coldUsd)}, a warm turn ${fmtUsd(hold.warmUsd)}.`} width={width} height={132} /> : null}
          {holdButtons}
          {below}
        </Box>
      )
    }

    // Terminal: the same deck in cells.
    const barCells = Math.max(10, Math.min(60, cols - 40))
    const ratio = v.percent === null ? 0 : v.percent / 100
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text color={ratio >= 0.5 ? p.hot : p.calm}>{gaugeText(v.percent, barCells)}</Text>
          <Text bold>{v.percent === null ? 'n/a' : `${v.percent}%`}</Text>
          {crew}
          {flame}
          {running}
          {cancelRun}
          {handover}
          {end}
        </Box>
        {tiles.length > 0 ? <Text dimColor>{tiles.map(t => `${t.label} ${t.value}`).join('  ·  ')}</Text> : null}
        {hold ? (
          <Text color={p.hot}>{`On hold, the cache went cold. Send now ${fmtUsd(hold.coldUsd)}, a warm turn would be ${fmtUsd(hold.warmUsd)}.`}</Text>
        ) : null}
        {holdButtons}
        {below}
      </Box>
    )
  })
}
