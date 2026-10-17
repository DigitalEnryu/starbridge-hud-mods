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

export type Tile = { label: string; value: string; tone?: 'calm' | 'hot' }

/** The height of a tile: one line, level with the desktop's native buttons. */
export const TILE_H = 26

/** Width of a one-line tile: the label, a gap, the value. About 6px a label character, 7.6px a value one. */
function tileWidth(t: Tile): number {
  return t.label.length * 5.7 + t.value.length * 7 + 22
}

/** A strip of one-line stat chips: a dim label, then its value. */
export function tilesSvg(tiles: readonly Tile[], p: Palette): { svg: string; width: number } {
  const h = TILE_H
  const gap = 6
  let x = 0
  const parts: string[] = []
  for (const t of tiles) {
    const w = Math.round(tileWidth(t))
    const color = t.tone === 'calm' ? p.calm : t.tone === 'hot' ? p.hot : p.value
    parts.push(
      `<rect x="${x}" width="${w}" height="${h}" rx="7" fill="${p.tile}"/>`,
      `<text x="${x + 10}" y="17" font-size="12" font-family="${SANS}"><tspan fill="${p.label}">${xml(t.label)}</tspan><tspan dx="6" font-weight="600" fill="${color}">${xml(t.value)}</tspan></text>`,
    )
    x += w + gap
  }
  const width = Math.max(1, x - gap)
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

export type KeyArt = { glyph?: string; glyphColor?: string; label: string; fg: string; bg: string; edge: string; hover?: boolean }

/** The height of a key, its glow included: a little taller than a chip so the glow has room. */
export const KEY_H = 30

/** A pressable key as an image: a rounded fill, a crisp outline and a soft glow of the same colour. */
export function keySvg(k: KeyArt): { svg: string; width: number } {
  const glyphW = k.glyph ? (k.glyph.codePointAt(0)! >= 0x1f000 ? 16 : 11) + 6 : 0
  const textW = Math.round(k.label.length * 7.6)
  const w = 3 + 11 + glyphW + textW + 11 + 3
  const h = KEY_H
  const glow = k.hover ? 0.95 : 0.55
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs><filter id="g" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>`,
    `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="8" fill="none" stroke="${k.edge}" stroke-width="2.5" opacity="${glow}" filter="url(#g)"/>`,
    `<rect x="3.5" y="3.5" width="${w - 7}" height="${h - 7}" rx="7.5" fill="${k.bg}" stroke="${k.edge}" stroke-width="1.2"/>`,
  ]
  let x = 3 + 11
  if (k.glyph) {
    parts.push(`<text x="${x}" y="19.5" font-size="12" fill="${k.glyphColor ?? k.fg}" font-family="Segoe UI Symbol, Segoe UI Emoji, sans-serif">${xml(k.glyph)}</text>`)
    x += glyphW
  }
  parts.push(`<text x="${x}" y="19.5" font-size="13" font-weight="600" fill="${k.fg}" font-family="${SANS}">${xml(k.label)}</text>`, `</svg>`)
  return { svg: parts.join(''), width: w }
}
