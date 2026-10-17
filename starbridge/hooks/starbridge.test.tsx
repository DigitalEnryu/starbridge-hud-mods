import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import DeckButton from './deck-button'
import { coldUsd, crewKeySvg, DARK, extractResume, gaugeSvg, gaugeText, holdCardSvg, isRunLive, KEY_CANVAS_H, KEY_H, KEY_TOP, keySvg, priceOf, RUN_MAX_MS, warmUsd } from './logic'

const PLUGIN = 'starbridge'

// Desktop draws Starbridge's own buttons (Clients); the terminal draws native Buttons. These read and
// click either kind by key.
type Found = { type?: string; props: Record<string, unknown> } | undefined
const labelOf = (el: Found) => {
  if (el?.props.label !== undefined) return el.props.label as string
  const p = el?.props.props as { glyph?: string; label?: string } | undefined
  return p?.label === undefined ? undefined : p.glyph ? `${p.glyph} ${p.label}` : p.label
}
async function click(ui: { find: (q: { key: string }) => Promise<Found>; press: (q: { key: string }) => Promise<unknown>; post: (data: unknown, scope: { in: string }) => Promise<unknown> }, key: string) {
  const el = await ui.find({ key })
  if (el?.type === 'Client') await ui.post({ action: (el.props.props as { action: string }).action }, { in: key })
  else await ui.press({ key })
}
const MIN = 60 * 1000
const START = Date.parse('2026-10-17T12:00:00Z')
const band = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 110, scroll: { offset: 0, bodyRows: 10 }, view: {} }
const MODEL = 'claude-opus-5-5'

const HANDOVER_ANSWER = [
  'Handover brief written.',
  '',
  '```text',
  'Resume: finish the Starbridge HUD.',
  '```',
  '',
  "Run /clear, paste this in the new session, and you're back where we left off.",
].join('\n')

type Opts = { tokens?: number; fork?: Array<{ read: number; write: number }>; ask?: string }

function world(on: On, opts: Opts = {}) {
  const clock = mock.clock(on, { now: START })
  mock.store(on, {})
  const submitted: string[] = []
  const commands: string[] = []
  const filled: string[] = []
  const forks: number[] = []
  const answers = [...(opts.fork ?? [])]
  on('session.start', async ($, e) => ({ cwd: e.cwd }) as never)
  on('session.usage', async () => ({ value: { startedAt: START, context: { window: 1000000, tokens: opts.tokens, percent: opts.tokens ? Math.round(opts.tokens / 10000) : undefined }, rateLimits: [], cost: { usd: 4.12 } } }) as never)
  on('session.model', async () => ({ value: 'Opus 5.5' }) as never)
  on('config.list', async () => ({ value: [] }) as never)
  on('command.register', async ($, e) => ({ value: { command: e.name } }) as never)
  on('turn.complete', async ($, e) => ({ text: e.answer }) as never)
  on('prompt.submit', async ($, e) => {
    submitted.push(e.text)
    return { text: e.text } as never
  })
  on('prompt.fill', async ($, e) => {
    filled.push(e.text)
    return { isFilled: true } as never
  })
  on('command.run', async ($, e) => {
    commands.push(e.command)
    return { text: '' } as never
  })
  on('classic.SessionStart', async () => ({}) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('ui.render', async () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e) => {
    const q = (e as { questions: { question: string }[] }).questions[0].question
    return { result: { questions: (e as { questions: unknown[] }).questions, answers: { [q]: opts.ask ?? 'Cancel' } } } as never
  })
  on('model.fork', async () => {
    forks.push(forks.length)
    const a = answers.shift() ?? { read: 0, write: 100000 }
    return { value: { isAnswered: true, text: 'warm', usage: { input_tokens: 2, output_tokens: 1, cache_read_input_tokens: a.read, cache_creation_input_tokens: a.write } } } as never
  })
  return { clock, submitted, commands, filled, forks }
}

const start = ($: Engine) => $.session.start({ source: 'startup', cwd: '/w', surface: 'desktop', isInteractive: true } as never)
const turn = (answer = 'ok') => ({ answer, reason: 'answer', durationMs: 1000, isAborted: false, turnId: `t${Math.random()}`, usage: { model: MODEL, input_tokens: 2, output_tokens: 10, cache_read_input_tokens: 120000, cache_creation_input_tokens: 500 } }) as never
const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as never

// ---- Pure logic -------------------------------------------------------------------------------

test('the gauge carries its percentage and the 50% notch', async () => {
  const svg = gaugeSvg(37, 500, DARK)
  expect(svg).toContain('>37%</text>')
  expect(svg).toContain('x="249"')
  expect(gaugeSvg(null, 500, DARK)).toContain('>n/a</text>')
})

test('the terminal gauge marks the 50% line', async () => {
  const bar = gaugeText(30, 20)
  expect(bar[10]).toBe('│')
  expect(bar.startsWith('██████░')).toBe(true)
})

test('prices: a cold re-read costs the write rate, a warm one the read rate', async () => {
  const price = priceOf(MODEL)!
  // Opus 5.5: 1-hour write $8/MTok (2x the $4 base), cache read $0.20/MTok.
  expect(Math.round(coldUsd(52000, price) * 1000) / 1000).toBe(0.416)
  expect(Math.round(warmUsd(52000, price) * 10000) / 10000).toBe(0.0104)
  expect(priceOf('claude-opus-5')).toEqual({ read: 0.5, write: 10, out: 25 })
  expect(priceOf('Opus 5.5')).toEqual(price)
  expect(priceOf('some-other-model')).toBe(null)
})

test('a resume prompt is the fenced block before the sentinel line, and nothing else', async () => {
  expect(extractResume(HANDOVER_ANSWER)).toBe('Resume: finish the Starbridge HUD.')
  expect(extractResume('```text\ncode\n```\nDone.')).toBe(null)
  expect(isRunLive({ mode: 'handover', turns: 0, startedAt: 0 }, RUN_MAX_MS + 1)).toBe(false)
})

test('the hold card escapes the quoted message', async () => {
  const svg = holdCardSvg(600, { text: 'a <b> & "c"', idleMs: 72 * MIN, coldUsd: 0.52, warmUsd: 0.03, tokens: 52000 }, DARK)
  expect(svg).toContain('a &lt;b&gt; &amp; &quot;c&quot;')
  expect(svg).toContain('idle 1h12m')
})

// ---- The band ---------------------------------------------------------------------------------

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: the band draws Keep warm, Handover and End session`, async ($, on) => {
    world(on, { tokens: 370000 })
    await start($)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    expect(labelOf(await ui.find({ key: 'starbridge-warm' }))).toBe('🔥 Off')
    expect(labelOf(await ui.find({ key: 'starbridge-handover' }))).toBe('▶ Handover')
    expect(labelOf(await ui.find({ key: 'starbridge-end' }))).toMatch(/End session$/)
    expect((await ui.findAll({ type: 'Svg' })).length > 0).toBe(surface === 'desktop')
    await ui.unmount()
  })
}

test('Keep warm: ON pings before the hour is up and counts what it spent; OFF stops it', async ($, on) => {
  const w = world(on, { tokens: 120000, fork: [{ read: 120000, write: 0 }, { read: 120000, write: 0 }] })
  await start($)
  await $.turn.complete(turn())
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: band })
  await click(ui as never, 'starbridge-warm')
  expect(labelOf(await ui.find({ key: 'starbridge-warm' }))).toBe('🔥 On')
  await w.clock.advance(50 * MIN)
  expect(w.forks.length).toBe(1)
  await w.clock.advance(50 * MIN)
  expect(w.forks.length).toBe(2)
  expect((await $.command.run({ command: 'starbridge', args: 'status' } as never)).text).toMatch(/kept warm 2 times/)
  await click(ui as never, 'starbridge-warm')
  await w.clock.advance(60 * MIN)
  expect(w.forks.length).toBe(2)
  await ui.unmount()
})

test('a cold send over 50k tokens is held; Send goes through, Edit refills the box', async ($, on) => {
  const w = world(on, { tokens: 120000 })
  await start($)
  await $.turn.complete(turn())
  await w.clock.advance(70 * MIN)
  const held = await $.prompt.submit(typed('Where were we?'))
  expect('drop' in held && typeof held.drop === 'string').toBe(true)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: band })
  expect(String(labelOf(await ui.find({ key: 'starbridge-send' })))).toMatch(/^Send for \$/)
  await click(ui as never, 'starbridge-send')
  expect(w.submitted.at(-1)).toBe('Where were we?')
  expect(await ui.find({ key: 'starbridge-send' })).toBe(undefined)

  await $.prompt.submit(typed('And then?'))
  await click(ui as never, 'starbridge-edit')
  expect(w.filled).toEqual(['And then?'])
  await ui.unmount()
})

test('a warm send, or a small context, is never held', async ($, on) => {
  const w = world(on, { tokens: 20000 })
  await start($)
  await $.turn.complete(turn())
  await w.clock.advance(70 * MIN)
  const r = await $.prompt.submit(typed('hi'))
  expect('drop' in r && r.drop !== undefined).toBe(false)
})

test('Handover: confirm, wait for the resume prompt, /clear, then send it', async ($, on) => {
  const w = world(on, { tokens: 120000, ask: 'Run handover' })
  await start($)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: band })
  await click(ui as never, 'starbridge-handover')
  await w.clock.settle()
  expect(w.submitted).toEqual(['handover'])
  await $.turn.complete(turn('Which task next?'))
  await w.clock.advance(2000)
  expect(w.commands).toEqual([])
  await $.turn.complete(turn(HANDOVER_ANSWER))
  await w.clock.advance(2000)
  expect(w.commands).toEqual(['clear'])
  expect(w.submitted).toEqual(['handover', 'Resume: finish the Starbridge HUD.'])
  await ui.unmount()
})

test('Handover: Cancel sends nothing', async ($, on) => {
  const w = world(on, { ask: 'Cancel' })
  await start($)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: band })
  await click(ui as never, 'starbridge-handover')
  await w.clock.settle()
  expect(w.submitted).toEqual([])
  await ui.unmount()
})

test('the warm and cold tiles show before any reply, priced from the session model', async ($, on) => {
  world(on, { tokens: 120000 })
  await start($)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: band })
  const alts = (await ui.findAll({ type: 'Svg' })).map(svg => String(svg.props.alt))
  expect(alts.some(a => /Next turn, warm \$0\.02/.test(a) && /If it goes cold \$0\.96/.test(a))).toBe(true)
  await ui.unmount()
})

test('/starbridge preview dresses the HUD up, and preview off puts it back', async ($, on) => {
  world(on, { tokens: 20000 })
  await start($)
  await $.command.run({ command: 'starbridge', args: 'preview 64 warm hold' } as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: band })
  expect(labelOf(await ui.find({ key: 'starbridge-warm' }))).toBe('🔥 On')
  expect(await ui.find({ key: 'starbridge-send' })).not.toBe(undefined)
  const alts = (await ui.findAll({ type: 'Svg' })).map(svg => String(svg.props.alt))
  expect(alts.some(a => a === 'Context 64% full')).toBe(true)
  await ui.unmount()
  await $.command.run({ command: 'starbridge', args: 'preview off' } as never)
  const again = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: band })
  expect(labelOf(await again.find({ key: 'starbridge-warm' }))).toBe('🔥 Off')
  expect(await again.find({ key: 'starbridge-send' })).toBe(undefined)
  await again.unmount()
})

test('a deck button brightens under the pointer and posts its action on a click', async () => {
  let state: unknown
  let pointer: ((e: { type: string; button?: string; x: number; y: number }) => void) | null = null
  const posts: unknown[] = []
  const surface = {
    elements: { Box: (p: unknown) => ({ type: 'Box', props: p }), Text: (p: unknown) => ({ type: 'Text', props: p }) },
    get state() { return state },
    setState: (next: unknown) => { state = next },
    onPointer: (fn: typeof pointer) => { pointer = fn; return () => {} },
    post: (d: unknown) => posts.push(d),
  }
  const props = { action: 'handover', label: '⇄ Handover', fg: '#fff', bg: '#111', hoverBg: '#222' }
  const draw = () => (DeckButton as unknown as (p: typeof props, s: typeof surface) => { props: { backgroundColor: string } })(props, surface)
  expect(draw().props.backgroundColor).toBe('#111')
  pointer!({ type: 'enter', x: 0, y: 0 })
  expect(draw().props.backgroundColor).toBe('#222')
  pointer!({ type: 'down', button: 'left', x: 1, y: 0 })
  draw()
  pointer!({ type: 'up', button: 'left', x: 1, y: 0 })
  expect(posts).toEqual([{ action: 'handover' }])
})

test('hover fades a glow in and out on a layer of its own; the key art never changes, so animations never restart', async ($, on) => {
  const w = world(on, { tokens: 120000 })
  await start($)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: band })
  const svgs = async () => (await ui.findAll({ type: 'Svg' })).map(svg => ({ alt: String(svg.props.alt), src: String(svg.props.source) }))
  const art = async (alt: string) => (await svgs()).find(s => s.alt === alt)!.src
  const glow = async (alt: string) => Number((await svgs()).find(s => s.alt === `${alt} glow`)!.src.match(/opacity="([\d.]+)"/)![1])
  for (const [action, key, alt] of [['crew', 'starbridge-crew', 'Agents panel'], ['handover', 'starbridge-handover', '▶ Handover']] as const) {
    const before = await art(alt)
    const rest = await glow(alt)
    await ui.post({ hover: action }, { in: key })
    await w.clock.advance(60)
    const rising = await glow(alt)
    expect(rising > rest && rising < 0.95).toBe(true)
    await w.clock.advance(400)
    expect(await glow(alt)).toBe(0.95)
    expect(await art(alt)).toBe(before)
    // Leaving mid-fade turns it round from where it is: no jump to full, no jump to rest.
    await ui.post({ hover: null }, { in: key })
    await w.clock.advance(30)
    const falling = await glow(alt)
    expect(falling < 0.95 && falling > rest).toBe(true)
    await ui.post({ hover: action }, { in: key })
    await w.clock.advance(30)
    expect(await glow(alt) > falling).toBe(true)
    await ui.post({ hover: null }, { in: key })
    await w.clock.advance(600)
    expect(await glow(alt)).toBe(rest)
    expect(await art(alt)).toBe(before)
  }
  await ui.unmount()
})

test('the mascot key animates 12 poses and opens the agents panel when clicked', async ($, on) => {
  const w = world(on, { tokens: 120000 })
  await start($)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: band })
  const art = (await ui.findAll({ type: 'Svg' })).find(svg => svg.props.alt === 'Agents panel')
  expect(art?.props.isInteractive).toBe(true)
  expect((String(art?.props.source).match(/<animate /g) ?? []).length).toBe(12)
  await click(ui as never, 'starbridge-crew')
  expect(w.commands).toEqual(['agents-info'])
  await ui.unmount()
})

test('turning Keep warm on or off moves nothing: every key and the chip strip keep their size', async ($, on) => {
  const w = world(on, { tokens: 120000 })
  await start($)
  await $.turn.complete(turn())
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: { ...band, bodyColumns: 125 } })
  const sizes = async () => (await ui.findAll({ type: 'Svg' })).filter(svg => !String(svg.props.alt).startsWith('Context')).map(svg => `${svg.props.width}x${svg.props.height}`)
  const off = await sizes()
  await click(ui as never, 'starbridge-warm')
  await w.clock.settle()
  expect(labelOf(await ui.find({ key: 'starbridge-warm' }))).toBe('🔥 On')
  expect(await sizes()).toEqual(off)
  // The keys never give way when the row runs short: the chips do.
  for (const key of ['starbridge-crew-key', 'starbridge-warm-key', 'starbridge-handover-key', 'starbridge-end-key']) {
    expect((await ui.find({ key }))?.props.flexShrink).toBe(0)
  }
  await ui.unmount()
})

test('a narrow row shortens the chips rather than dropping them, so Keep warm on and off both keep their chips', async ($, on) => {
  const w = world(on, { tokens: 120000 })
  await start($)
  await $.turn.complete(turn())
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: { ...band, bodyColumns: 92 } })
  const strip = async () => (await ui.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).startsWith('This session'))!
  const off = await strip()
  expect(String(off.props.alt)).toMatch(/Next turn, warm .*If it goes cold/)
  expect(String(off.props.source)).toContain('>If cold<')
  await click(ui as never, 'starbridge-warm')
  await w.clock.settle()
  const lit = await strip()
  expect(String(lit.props.alt)).toMatch(/Kept warm 0 times/)
  expect(lit.props.width).toBe(off.props.width)
  await ui.unmount()
})

test('each key\'s click area fills the whole key, so a click anywhere on it lands', async ($, on) => {
  world(on, { tokens: 120000 })
  await start($)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: band })
  for (const key of ['starbridge-crew', 'starbridge-warm', 'starbridge-handover', 'starbridge-end']) {
    const el = await ui.find({ key })
    expect([el?.props.width, el?.props.height]).toEqual(['100%', '100%'])
  }
  await ui.unmount()
})

test('a key takes exactly its face: sparks and the jumping mascot hang above it, outside the click area', async ($, on) => {
  const w = world(on, { tokens: 120000 })
  await start($)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: band })
  await click(ui as never, 'starbridge-warm')
  await w.clock.settle()
  type Node = { type?: string; props?: Record<string, unknown> }
  for (const key of ['starbridge-crew-key', 'starbridge-warm-key', 'starbridge-handover-key', 'starbridge-end-key']) {
    const kids = ((await ui.find({ key }))?.children ?? []) as Node[]
    // In the flow: one image the height of the face. The click area is stretched over that box alone.
    const inFlow = kids.filter(k => k.props?.position !== 'absolute')
    expect(inFlow.map(k => [k.type, k.props?.height])).toEqual([['Svg', KEY_H]])
    // The art and its glow hang from the face's bottom edge, out of the flow: face height, or taller
    // where the art reaches up (sparks, the jumping mascot).
    const hung = kids.filter(k => k.props?.position === 'absolute' && k.props?.bottom === 0 && k.props?.top === undefined)
    expect(hung.length).toBe(2)
    for (const k of hung) {
      expect([KEY_H, KEY_CANVAS_H]).toContain(((k as { children?: Node[] }).children ?? [])[0]?.props?.height)
    }
  }
  await ui.unmount()
})

test('Keep warm on: the flame burns red to gold and throws sparks above the key; off: a still grey flame', () => {
  const lit = keySvg({ label: 'On', sizeAs: 'Off', flame: 'on', fg: '#ffc93c', bg: '#2b2208', edge: '#ffc93c' })
  const out = keySvg({ label: 'Off', sizeAs: 'Off', flame: 'off', fg: '#c9c7bf', bg: '#222220', edge: '#5d5c57' })
  expect(lit.width).toBe(out.width)
  expect(lit.svg).toMatch(/<animate attributeName="fill" values="[^"]*#ff3b2f[^"]*#ffc93c/)
  const sparks = [...lit.svg.matchAll(/<circle class="spark"[^>]*>(.*?)<\/circle>/g)]
  expect(sparks.length >= 4).toBe(true)
  // Each spark rises from inside the key to above its top edge.
  for (const s of sparks) {
    const ys = (s[1].match(/attributeName="cy" values="([^"]+)"/)?.[1] ?? '').split(';').map(Number)
    expect(ys[0] > KEY_TOP).toBe(true)
    expect(ys.at(-1)! < KEY_TOP).toBe(true)
  }
  expect(out.svg).not.toContain('<animate')
  expect(out.svg).not.toContain('spark')
})

test('the mascot is drawn bigger than its frame allows: standing it clears the sides, jumping it leaves the top', () => {
  const art = crewKeySvg({ edge: '#d97757', bg: '#1f1a17' })
  const frame = art.svg.match(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="7.5"/)!.slice(1).map(Number)
  const [fx, fy, fw] = frame
  const poses = [...art.svg.matchAll(/<g opacity="[01]">(.*?)<\/g>/g)].map(g => [...g[1].matchAll(/<rect x="(\d+)" y="(-?\d+)" width="(\d+)"/g)].map(m => m.slice(1).map(Number)))
  expect(poses.length).toBe(12)
  expect(poses[0][0][2]).toBe(3)
  for (const px of poses) {
    for (const [x, , cw] of px) {
      expect(x >= fx + 3).toBe(true)
      expect(x + cw <= fx + fw - 3).toBe(true)
    }
  }
  expect(poses.some(px => px.some(([, y]) => y < fy - 4))).toBe(true)
})
