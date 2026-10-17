// Starbridge: pure helpers. No `$` here, so tests can call every function directly.

/** A subscription's prompt cache lives an hour after its last read. */
export const TTL_MS = 60 * 60 * 1000
/** Keep warm pings this long after the last request, well inside the hour. */
export const PING_EVERY_MS = 50 * 60 * 1000
/** Below this many tokens a cold re-read is too cheap to hold a message for. */
export const HOLD_MIN_TOKENS = 50_000
/** The handover line on the gauge. */
export const MARK = 0.5
/** A button run lapses after this long, or this many finished turns, without a resume prompt. */
export const RUN_MAX_MS = 30 * 60 * 1000
export const RUN_MAX_TURNS = 3
export const PING_PROMPT = 'Reply with the single word: warm'

/** The end-session skill closes a handover with this line, outside the fenced resume prompt. */
export const SENTINEL = /Run \/clear, paste this in the new session/i

// US$ per million tokens: [cache read, 1-hour cache write, output]. Anthropic first-party list prices
// as of 2026-10-06. A 1-hour cache write costs 2x the base input price; cache reads are per model.
// Longer names first: a model id takes the first row it contains ('opus-5-5' before 'opus-5').
const PRICES: ReadonlyArray<readonly [string, number, number, number]> = [
  ['fable-5-1', 0.25, 20, 50], //   base input $10
  ['fable-5', 1, 20, 50], //        base input $10
  ['opus-5-5', 0.2, 8, 20], //      base input $4
  ['opus-5', 0.5, 10, 25], //       base input $5
  ['opus-4', 0.5, 10, 25], //       base input $5 (4.6, 4.7, 4.8)
  ['sonnet-5', 0.2, 4, 10], //      base input $2 (5 and 5.5)
  ['sonnet-4', 0.3, 6, 15], //      base input $3
  ['haiku-5-5', 0.01, 0.2, 0.5], // base input $0.10, prompts up to 100k
  ['haiku-4', 0.1, 2, 5], //        base input $1
]

export type Price = { read: number; write: number; out: number }

export function priceOf(model: string | null): Price | null {
  if (!model) return null
  // Ids ("claude-opus-5-5") and display names ("Opus 5.5") both reduce to "opus-5-5".
  const id = model.toLowerCase().replace(/[\s.]+/g, '-')
  const row = PRICES.find(([name]) => id.includes(name))
  return row ? { read: row[1], write: row[2], out: row[3] } : null
}

/** What re-sending the whole context costs once the cache is cold. */
export function coldUsd(tokens: number, price: Price): number {
  return (tokens * price.write) / 1e6
}

/** What the same context costs while the cache is warm. */
export function warmUsd(tokens: number, price: Price): number {
  return (tokens * price.read) / 1e6
}

/** One keep-warm ping, from the usage it reported. */
export function pingUsd(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }, price: Price): number {
  return (u.cache_read_input_tokens * price.read + u.cache_creation_input_tokens * price.write + u.input_tokens * (price.write / 2) + u.output_tokens * price.out) / 1e6
}

export function isCold(lastRequestAt: number, now: number): boolean {
  return lastRequestAt > 0 && now - lastRequestAt >= TTL_MS
}

/** The resume prompt from a finished handover answer: the last fenced block before the sentinel line. */
export function extractResume(answer: string): string | null {
  const at = answer.search(SENTINEL)
  if (at < 0) return null
  const blocks = [...answer.slice(0, at).matchAll(/```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/g)]
  const text = blocks.at(-1)?.[1].trim() ?? ''
  return text.length > 0 ? text : null
}

export function isRunLive(run: { mode: string | null; turns: number; startedAt: number }, now: number): boolean {
  if (run.mode === null) return false
  if (now - run.startedAt > RUN_MAX_MS) return false
  return run.turns < RUN_MAX_TURNS
}

export function fmtUsd(usd: number): string {
  if (usd < 0.01) return '<$0.01'
  if (usd < 100) return `$${usd.toFixed(2)}`
  return `$${Math.round(usd)}`
}

export function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}m`
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ---- Drawing --------------------------------------------------------------------------------

export type Palette = {
  track: string
  edge: string
  tile: string
  label: string
  value: string
  calm: string
  hot: string
  notch: string
  card: string
}

export const DARK: Palette = {
  track: '#1b1b1a', edge: '#3a3936', tile: '#30302e', label: '#8f8d86', value: '#e8e6df',
  calm: '#2bf0a8', hot: '#ffc93c', notch: '#57564f', card: '#1f1f1e',
}

export const LIGHT: Palette = {
  track: '#e9e7e1', edge: '#d3d1c7', tile: '#f1efe8', label: '#6b6a65', value: '#2c2c2a',
  calm: '#08a874', hot: '#b8860b', notch: '#a8a69e', card: '#f7f6f2',
}

const SANS = 'Segoe UI, system-ui, -apple-system, sans-serif'
const MONO = 'ui-monospace, Consolas, Menlo, monospace'

export const GAUGE_H = 18

/** The gauge: one capsule whose colour runs teal to gold to red, the percentage riding the fill. */
export function gaugeSvg(percent: number | null, width: number, p: Palette): string {
  const w = Math.max(160, Math.round(width))
  const h = GAUGE_H
  const r = h / 2
  const ratio = percent === null ? 0 : Math.min(1, Math.max(0, percent / 100))
  const fill = ratio === 0 ? 0 : Math.max(h, Math.round(ratio * w))
  const mark = Math.round(MARK * w)
  const label = percent === null ? 'n/a' : `${Math.round(percent)}%`
  const inside = fill >= 48
  const textX = inside ? fill - 9 : fill + 8
  const textFill = inside ? (ratio >= MARK ? '#3a2600' : '#04291c') : p.value
  const anchor = inside ? 'end' : 'start'
  const passed = fill > mark
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs><linearGradient id="sb-heat" x1="0" y1="0" x2="${w}" y2="0" gradientUnits="userSpaceOnUse">`,
    `<stop offset="0" stop-color="#12e39a"/><stop offset="0.44" stop-color="#3ff2b4"/><stop offset="0.56" stop-color="#ffd23f"/>`,
    `<stop offset="0.8" stop-color="#ffb21e"/><stop offset="1" stop-color="#ff4d4f"/></linearGradient>`,
    `<clipPath id="sb-cap"><rect width="${w}" height="${h}" rx="${r}"/></clipPath></defs>`,
    `<rect width="${w}" height="${h}" rx="${r}" fill="${p.track}"/>`,
    `<g clip-path="url(#sb-cap)">`,
    fill > 0 ? `<rect width="${fill}" height="${h}" rx="${r}" fill="url(#sb-heat)"/>` : '',
    fill > 0 ? `<rect y="1" width="${fill}" height="6" rx="3" fill="#ffffff" opacity="0.13"/>` : '',
    passed ? `<rect x="${mark - 1}" width="2" height="${h}" fill="${p.track}"/>` : `<rect x="${mark - 1}" y="4" width="2" height="${h - 8}" rx="1" fill="${p.notch}"/>`,
    `</g>`,
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${r - 0.5}" fill="none" stroke="${p.edge}"/>`,
    `<text x="${textX}" y="13" text-anchor="${anchor}" font-size="11" font-weight="600" fill="${textFill}" font-family="${MONO}">${label}</text>`,
    `</svg>`,
  ].join('')
}

/** A stat chip. `short` is how it reads when the row is too narrow for the full words. */
export type Tile = { label: string; value: string; tone?: 'calm' | 'hot'; short?: { label: string; value: string } }

/** The chip in its short words, where it has any. */
export function shortened(t: Tile): Tile {
  return t.short ? { ...t, ...t.short, short: undefined } : t
}

/** The height of a tile: one line, level with the desktop's native buttons. */
export const TILE_H = 26

/** Width of a one-line tile: the label, a gap, the value. About 6px a label character, 7.6px a value one. */
function tileWidth(t: Tile): number {
  return t.label.length * 5.7 + t.value.length * 7 + 22
}

const TILE_GAP = 6

/** How wide a strip of these chips draws. */
export function stripWidth(tiles: readonly Tile[]): number {
  return Math.max(1, tiles.reduce((sum, t) => sum + Math.round(tileWidth(t)) + TILE_GAP, 0) - TILE_GAP)
}

/**
 * A strip of one-line stat chips: a dim label, then its value. `slot` widens the drawing past its chips
 * (so the row never shifts when they change), `top` drops them to sit level with the keys' faces.
 */
export function tilesSvg(tiles: readonly Tile[], p: Palette, o: { slot?: number; top?: number; height?: number } = {}): { svg: string; width: number } {
  const top = o.top ?? 0
  const h = o.height ?? TILE_H
  let x = 0
  const parts: string[] = []
  for (const t of tiles) {
    const w = Math.round(tileWidth(t))
    const color = t.tone === 'calm' ? p.calm : t.tone === 'hot' ? p.hot : p.value
    parts.push(
      `<rect x="${x}" y="${top}" width="${w}" height="${TILE_H}" rx="7" fill="${p.tile}"/>`,
      `<text x="${x + 10}" y="${top + 17}" font-size="12" font-family="${SANS}"><tspan fill="${p.label}">${xml(t.label)}</tspan><tspan dx="6" font-weight="600" fill="${color}">${xml(t.value)}</tspan></text>`,
    )
    x += w + TILE_GAP
  }
  const width = Math.max(stripWidth(tiles), Math.round(o.slot ?? 0))
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">${parts.join('')}</svg>`, width }
}

export type Hold = { text: string; idleMs: number; coldUsd: number; warmUsd: number; tokens: number }

/** The hold card: what sending now costs against what a warm turn would have. */
export function holdCardSvg(width: number, hold: Hold, p: Palette): string {
  const w = Math.max(320, Math.round(width))
  const h = 132
  const col = (w - 42) / 2
  const right = 14 + col + 14
  const warmBar = Math.max(4, Math.round(col * Math.min(1, hold.warmUsd / Math.max(hold.coldUsd, 0.0001))))
  const maxChars = Math.max(20, Math.floor((w - 28) / 6.6))
  const quote = hold.text.replace(/\s+/g, ' ').trim()
  const shown = quote.length > maxChars ? `${quote.slice(0, maxChars - 1)}…` : quote
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="${p.card}" stroke="${p.edge}"/>`,
    `<rect x="14" y="14" width="3" height="12" rx="1" fill="${p.hot}"/><rect x="20" y="14" width="3" height="12" rx="1" fill="${p.hot}"/>`,
    `<text x="32" y="25" font-size="14" font-weight="600" fill="${p.value}" font-family="${SANS}">Your message is on hold<tspan font-size="12" font-weight="400" fill="${p.label}">  ·  the cache went cold, idle ${fmtDuration(hold.idleMs)}</tspan></text>`,
    `<text x="14" y="52" font-size="11" fill="${p.label}" font-family="${SANS}">Send it now</text>`,
    `<text x="14" y="74" font-size="20" font-weight="600" fill="${p.hot}" font-family="${SANS}">${fmtUsd(hold.coldUsd)}</text>`,
    `<rect x="14" y="82" width="${Math.round(col)}" height="5" rx="2.5" fill="${p.hot}"/>`,
    `<text x="14" y="100" font-size="11" fill="${p.label}" font-family="${SANS}">re-reads ${fmtTokens(hold.tokens)} tokens at the full price</text>`,
    `<text x="${right}" y="52" font-size="11" fill="${p.label}" font-family="${SANS}">A warm turn</text>`,
    `<text x="${right}" y="74" font-size="20" font-weight="600" fill="${p.calm}" font-family="${SANS}">${fmtUsd(hold.warmUsd)}</text>`,
    `<rect x="${right}" y="82" width="${Math.round(col)}" height="5" rx="2.5" fill="${p.edge}"/>`,
    `<rect x="${right}" y="82" width="${warmBar}" height="5" rx="2.5" fill="${p.calm}"/>`,
    `<text x="${right}" y="100" font-size="11" fill="${p.label}" font-family="${SANS}">what it would have cost</text>`,
    `<text x="14" y="121" font-size="12" font-style="italic" fill="${p.label}" font-family="${SANS}">“${xml(shown)}”</text>`,
    `</svg>`,
  ].join('')
}

/** The terminal's gauge: block cells with a marker at the 50% line. */
export function gaugeText(percent: number | null, cells: number): string {
  const n = Math.max(10, cells)
  const ratio = percent === null ? 0 : Math.min(1, Math.max(0, percent / 100))
  const filled = Math.round(ratio * n)
  const mark = Math.round(MARK * n)
  let out = ''
  for (let i = 0; i < n; i++) out += i === mark ? '│' : i < filled ? '█' : '░'
  return out
}

export type KeyArt = {
  glyph?: string; glyphColor?: string; label: string; fg: string; bg: string; edge: string
  /** Size the key for this label instead, so a key whose label changes (On, Off) never changes size. */
  sizeAs?: string
  /** Draw a flame in place of a glyph: burning and throwing sparks, or still and grey. */
  flame?: 'on' | 'off'
  /** Draw `KEY_TOP` of headroom above the face (for sparks). Defaults to on for a flame key. */
  headroom?: boolean
}

/** An empty drawing: what holds a key's place in the row while its art hangs over it. */
export function blankSvg(w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"></svg>`
}

/** The height of a key's face, its glow included: a little taller than a chip so the glow has room. */
export const KEY_H = 30
/** Headroom above every key's face, where sparks fly and the mascot jumps out of its frame. */
export const KEY_TOP = 12
/** The height of every key's image: the headroom, then the face. */
export const KEY_CANVAS_H = KEY_TOP + KEY_H

const textWidth = (label: string) => Math.round(label.length * 7.6)

/** A flame standing on (0, 0): a tall tongue leaning right and a short one on the left, and its bright core. */
const FLAME_OUTER = 'M1 -15 C1.5 -11 6 -9 6.5 -5 C7 -1 4 1.5 0 1.5 C-4.5 1.5 -6.5 -1.5 -6 -4.8 C-5.7 -7.2 -4.2 -8.2 -3.6 -10.6 C-2.2 -9 -1.6 -7.6 -1.8 -6.2 C0.4 -8.4 1.6 -11.6 1 -15 Z'
const FLAME_CORE = 'M0.6 -8 C1.8 -5.8 3.2 -4.2 3.2 -2.2 C3.2 -0.2 1.7 0.8 0 0.8 C-1.7 0.8 -3.2 -0.2 -3.2 -2 C-3.2 -3.8 -1.4 -4.6 -0.8 -6.2 C-0.2 -5.4 0.2 -4.8 0.2 -4.2 C0.9 -5.2 1 -6.6 0.6 -8 Z'
const FLAME_W = 13

/** The flame: lit, it flickers red through amber to gold and throws sparks up out of the key; unlit, it is grey. */
function flameSvg(state: 'on' | 'off', cx: number, base: number): string {
  if (state === 'off') {
    return `<g transform="translate(${cx} ${base})"><path d="${FLAME_OUTER}" fill="#6b6a65"/><path d="${FLAME_CORE}" fill="#8f8d86"/></g>`
  }
  const flame = [
    `<g transform="translate(${cx} ${base})"><g>`,
    `<animateTransform attributeName="transform" type="scale" values="1 1;0.92 1.07;1.05 0.96;0.97 1.04;1 1" dur="0.7s" repeatCount="indefinite"/>`,
    `<path d="${FLAME_OUTER}" fill="#ff3b2f"><animate attributeName="fill" values="#ff3b2f;#ff6a1a;#ffb21e;#ffc93c;#ff8a1e;#ff3b2f" dur="1.6s" repeatCount="indefinite"/></path>`,
    `<path d="${FLAME_CORE}" fill="#ffc93c"><animate attributeName="fill" values="#ffc93c;#fff1a8;#ffe08a;#ffc93c" dur="0.9s" repeatCount="indefinite"/></path>`,
    `</g></g>`,
  ].join('')
  // Each spark leaves the flame's tip, drifts sideways and fades out above the key's top edge.
  const tip = base - 14
  const sparks = [
    { dx: -5, r: 1.9, dur: 1.5, begin: 0, fill: '#ffc93c' },
    { dx: 6, r: 1.6, dur: 1.8, begin: 0.3, fill: '#ff8a1e' },
    { dx: -2, r: 1.7, dur: 1.3, begin: 0.6, fill: '#fff1a8' },
    { dx: 9, r: 2, dur: 2, begin: 0.9, fill: '#ffb21e' },
    { dx: -8, r: 1.5, dur: 1.7, begin: 1.2, fill: '#ffc93c' },
    { dx: 3, r: 1.8, dur: 1.6, begin: 1.5, fill: '#ff6a1a' },
  ].map(s => [
    `<circle class="spark" cx="${cx}" cy="${tip}" r="${s.r}" fill="${s.fill}" opacity="0">`,
    `<animate attributeName="cy" values="${tip};${Math.round((tip + 1) / 2)};1" dur="${s.dur}s" begin="${s.begin}s" repeatCount="indefinite"/>`,
    `<animate attributeName="cx" values="${cx};${cx + s.dx / 2};${cx + s.dx}" dur="${s.dur}s" begin="${s.begin}s" repeatCount="indefinite"/>`,
    `<animate attributeName="opacity" values="0;1;0.9;0" keyTimes="0;0.15;0.6;1" dur="${s.dur}s" begin="${s.begin}s" repeatCount="indefinite"/>`,
    `</circle>`,
  ].join(''))
  return flame + sparks.join('')
}

/** The glow behind a key at rest, and under the pointer. */
export const GLOW_REST = 0.55
export const GLOW_LIT = 0.95

/**
 * A key's glow, drawn on a layer of its own behind the key: a soft ring of `color` round the face, at
 * `opacity`. The pointer fades this layer, never the key itself, so an animated key never redraws.
 */
export function glowSvg(g: { width: number; height: number; color: string; opacity: number }): string {
  const top = g.height - KEY_H
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}">`,
    `<defs><filter id="g" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>`,
    `<rect x="3" y="${top + 3}" width="${g.width - 6}" height="${KEY_H - 6}" rx="8" fill="none" stroke="${g.color}" stroke-width="2.5" opacity="${g.opacity}" filter="url(#g)"/>`,
    `</svg>`,
  ].join('')
}

/**
 * A pressable key as an image: a rounded fill and a crisp outline, with `KEY_TOP` of headroom above when
 * `headroom` says so (`height` is then KEY_CANVAS_H, else KEY_H). Its glow is a separate layer (glowSvg).
 * `isAnimated` says the drawing moves, so it needs an interactive Svg to play.
 */
export function keySvg(k: KeyArt): { svg: string; width: number; height: number; isAnimated: boolean } {
  const markW = k.flame ? FLAME_W + 6 : k.glyph ? (k.glyph.codePointAt(0)! >= 0x1f000 ? 16 : 11) + 6 : 0
  const w = 3 + 8 + markW + textWidth(k.sizeAs ?? k.label) + 8 + 3
  const top = (k.headroom ?? Boolean(k.flame)) ? KEY_TOP : 0
  const h = top + KEY_H
  const lit = k.flame === 'on'
  // A lit key adds a slow breath of extra glow over the glow layer.
  const breathe = lit
    ? `<rect x="3" y="${top + 3}" width="${w - 6}" height="${KEY_H - 6}" rx="8" fill="none" stroke="${k.edge}" stroke-width="2.5" opacity="0" filter="url(#g)"><animate attributeName="opacity" values="0;0.6;0" dur="2.4s" repeatCount="indefinite"/></rect>`
    : ''
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs><filter id="g" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>`,
    breathe,
    `<rect x="3.5" y="${top + 3.5}" width="${w - 7}" height="${KEY_H - 7}" rx="7.5" fill="${k.bg}" stroke="${k.edge}" stroke-width="1.2"/>`,
  ]
  // The mark and label sit centred, so a shorter label than `sizeAs` leaves even space both sides.
  let x = Math.round((w - markW - textWidth(k.label)) / 2)
  if (k.flame) {
    parts.push(flameSvg(k.flame, x + FLAME_W / 2, top + 21))
    x += markW
  } else if (k.glyph) {
    parts.push(`<text x="${x}" y="${top + 19.5}" font-size="12" fill="${k.glyphColor ?? k.fg}" font-family="Segoe UI Symbol, Segoe UI Emoji, sans-serif">${xml(k.glyph)}</text>`)
    x += markW
  }
  parts.push(`<text x="${x}" y="${top + 19.5}" font-size="13" font-weight="600" fill="${k.fg}" font-family="${SANS}">${xml(k.label)}</text>`, `</svg>`)
  return { svg: parts.join(''), width: w, height: h, isAnimated: lit }
}

// ---- The crew key: a pixel mascot that loops through 12 poses --------------------------------

type Px = readonly [number, number, string]

const CLAY = '#d97757'
const EYE = '#1b1b1a'
const STEEL = '#a9a79f'
const COOKIE = '#e0a84a'
const CHIP = '#6b3f1f'
const SCREEN = '#2bf0a8'

/** One pose of the mascot on a 12 x 9 grid: body, eyes, claws and legs, plus a prop when it holds one. */
function pose(opts: { lift?: number; blink?: boolean; claws?: 'side' | 'up' | 'down' | 'wave' | 'eat'; legs?: 'stand' | 'tuck'; prop?: 'laptop' | 'bar' | 'cookie' | 'crumb' }): Px[] {
  const y0 = 2 - (opts.lift ?? 0)
  const px: Px[] = []
  for (let x = 2; x <= 9; x++) for (let y = y0; y <= y0 + 4; y++) px.push([x, y, CLAY])
  // A blink closes each two-pixel eye to one pixel, low.
  if (opts.blink) px.push([4, y0 + 2, EYE], [7, y0 + 2, EYE])
  else px.push([4, y0 + 1, EYE], [4, y0 + 2, EYE], [7, y0 + 1, EYE], [7, y0 + 2, EYE])
  const claws = opts.claws ?? 'side'
  if (claws === 'side') px.push([1, y0 + 2, CLAY], [10, y0 + 2, CLAY])
  if (claws === 'down') px.push([1, y0 + 3, CLAY], [10, y0 + 3, CLAY])
  if (claws === 'up') px.push([1, y0, CLAY], [1, y0 - 1, CLAY], [10, y0, CLAY], [10, y0 - 1, CLAY])
  if (claws === 'wave') px.push([1, y0 + 2, CLAY], [10, y0, CLAY], [11, y0 - 1, CLAY])
  if (claws === 'eat') px.push([1, y0 + 2, CLAY], [10, y0 + 3, CLAY])
  if ((opts.legs ?? 'stand') === 'stand') for (const x of [3, 5, 6, 8]) px.push([x, y0 + 5, CLAY])
  else for (const x of [3, 8]) px.push([x, y0 + 5, CLAY])
  if (opts.prop === 'laptop') for (let x = 3; x <= 8; x++) px.push([x, 8, x === 3 || x === 8 ? STEEL : SCREEN])
  if (opts.prop === 'bar') for (let x = 0; x <= 11; x++) px.push([x, y0 - 2, x <= 1 || x >= 10 ? STEEL : '#77756e'])
  if (opts.prop === 'cookie') px.push([10, y0 + 1, COOKIE], [11, y0 + 1, COOKIE], [10, y0 + 2, CHIP], [11, y0 + 2, COOKIE])
  if (opts.prop === 'crumb') px.push([10, y0 + 2, COOKIE], [11, y0 + 4, COOKIE])
  return px
}

/** The 12-pose loop: working at a laptop, a blink, jumping, lifting a bar, a cookie break, a wave. */
export const CREW_POSES: ReadonlyArray<Px[]> = [
  pose({ claws: 'down', prop: 'laptop' }),
  pose({ claws: 'side', prop: 'laptop' }),
  pose({ claws: 'down', prop: 'laptop' }),
  pose({ claws: 'down', prop: 'laptop', blink: true }),
  pose({ lift: 1, claws: 'up', legs: 'tuck' }),
  pose({ claws: 'side' }),
  pose({ lift: 1, claws: 'up', legs: 'tuck' }),
  pose({ claws: 'up', prop: 'bar' }),
  pose({ lift: 1, claws: 'up', prop: 'bar' }),
  pose({ claws: 'eat', prop: 'cookie' }),
  pose({ claws: 'eat', prop: 'crumb', blink: true }),
  pose({ claws: 'wave' }),
]

/**
 * Where the mascot's grid starts, from the top of its image. Standing, its feet land a third of the way up
 * from the frame's floor and its head rides just over the rim; jumps clear the rim.
 */
const CREW_OY = 7

/**
 * The mascot key: its 12 poses swapped every 0.2s in a loop (SMIL, no script). The mascot is bigger than
 * the frame, on purpose: standing, its head and shoulders show over the rim, and it jumps clear of the
 * top into the headroom. Side to side it always keeps clear of the frame's edges.
 */
export function crewKeySvg(k: { edge: string; bg: string; running?: number }): { svg: string; width: number } {
  const h = KEY_CANVAS_H
  const cell = 3
  const w = 12 * cell + 2 * 4 + 6
  const ox = Math.round((w - 12 * cell) / 2)
  const oy = CREW_OY
  const n = CREW_POSES.length
  const dur = (n * 0.2).toFixed(1)
  const keyTimes = Array.from({ length: n }, (_, i) => (i / n).toFixed(4)).join(';')
  const frames = CREW_POSES.map((px, i) => {
    const values = Array.from({ length: n }, (_, j) => (j === i ? 1 : 0)).join(';')
    const rects = px.map(([x, y, c]) => `<rect x="${ox + x * cell}" y="${oy + y * cell}" width="${cell}" height="${cell}" fill="${c}"/>`).join('')
    return `<g opacity="${i === 0 ? 1 : 0}"><animate attributeName="opacity" values="${values}" keyTimes="${keyTimes}" dur="${dur}s" calcMode="discrete" repeatCount="indefinite"/>${rects}</g>`
  })
  const top = KEY_TOP
  const badge = k.running && k.running > 0
    ? `<circle cx="${w - 8}" cy="${top + 8}" r="6" fill="#ff4d5e"/><text x="${w - 8}" y="${top + 11}" text-anchor="middle" font-size="9" font-weight="700" fill="#ffffff" font-family="${SANS}">${Math.min(9, k.running)}</text>`
    : ''
  return {
    svg: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">`,
      `<rect x="3.5" y="${top + 3.5}" width="${w - 7}" height="${KEY_H - 7}" rx="7.5" fill="${k.bg}" stroke="${k.edge}" stroke-width="1.2" shape-rendering="auto"/>`,
      ...frames,
      badge,
      `</svg>`,
    ].join(''),
    width: w,
  }
}
