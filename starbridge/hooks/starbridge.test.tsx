import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import DeckButton from './deck-button'
import { coldUsd, DARK, extractResume, gaugeSvg, gaugeText, holdCardSvg, isRunLive, priceOf, RUN_MAX_MS, warmUsd } from './logic'

const PLUGIN = 'starbridge'

// Desktop draws Starbridge's own buttons (Clients); the terminal draws native Buttons. These read and
// click either kind by key.
type Found = { type?: string; props: Record<string, unknown> } | undefined
const labelOf = (el: Found) => (el?.props.label ?? (el?.props.props as { label?: string } | undefined)?.label) as string | undefined
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
    expect(labelOf(await ui.find({ key: 'starbridge-handover' }))).toBe('⇄ Handover')
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
