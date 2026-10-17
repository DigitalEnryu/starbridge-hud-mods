// Fork addition: tests for the context row and the session buttons.
import { expect, mock, test } from 'claude-code/testing'

import { windowBar, extractResume, isRunLive, RUN_MAX_MS, RUN_MAX_TURNS } from './session-logic'

const PLUGIN = 'savvy-progress'
const band = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} }

const HANDOVER_ANSWER = [
  'Handover brief written.',
  '',
  '```text',
  'Resume: finish the keep-warm toggle.',
  'Read handover.md first.',
  '```',
  '',
  "Run /clear, paste this in the new session, and you're back where we left off.",
].join('\n')

test('extractResume takes the fenced block before the sentinel line', async () => {
  expect(extractResume(HANDOVER_ANSWER)).toBe('Resume: finish the keep-warm toggle.\nRead handover.md first.')
})

test('extractResume returns null without the sentinel, so nothing is cleared', async () => {
  expect(extractResume('```text\nsome code\n```\nAll done.')).toBe(null)
  expect(extractResume("Run /clear, paste this in the new session, and you're back.")).toBe(null)
})

test('a button run lapses by time and by turns', async () => {
  const run = { mode: 'handover', turns: 0, startedAt: 1000 }
  expect(isRunLive(run, 2000)).toBe(true)
  expect(isRunLive(run, 1000 + RUN_MAX_MS + 1)).toBe(false)
  expect(isRunLive({ ...run, turns: RUN_MAX_TURNS }, 2000)).toBe(false)
  expect(isRunLive({ ...run, mode: null }, 2000)).toBe(false)
})

test('the bar marks the 50% line', async () => {
  const bar = windowBar(0.3, 20)
  expect(bar.length).toBe(20)
  expect(bar[10]).toBe('│')
  expect(bar.slice(0, 6)).toBe('▓▓▓▓▓▓')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: the row shows context and both buttons with no flow running`, async ($, on) => {
    on('session.measure', async (_$, e) => ({ changed: e.changed }) as never)
    await $.session.measure({ context: { tokens: 370000, window: 1000000, percent: 37 }, rateLimits: [], changed: ['context'] } as never)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    expect((await ui.find({ key: 'savvy-handover' }))?.props.label).toBe('Handover')
    expect((await ui.find({ key: 'savvy-end-session' }))?.props.label).toBe('End session')
    expect((await ui.findAll({ type: 'Text', text: /^37%$/ })).length).toBe(1)
    await ui.unmount()
  })
}

test('handover button: confirm, catch the resume prompt, /clear, then send it', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-17T12:00:00Z') })
  mock.store(on)
  const asked: string[] = []
  const submitted: string[] = []
  const commands: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const q = (e as { questions: { question: string }[] }).questions[0].question
    asked.push(q)
    return { result: { questions: (e as { questions: unknown[] }).questions, answers: { [q]: 'Run handover' } } } as never
  })
  on('prompt.submit', async (_$, e) => {
    submitted.push(e.text)
    return { text: e.text } as never
  })
  on('command.run', async (_$, e) => {
    commands.push(e.command)
    return { text: '' } as never
  })
  on('turn.complete', async (_$, e) => ({ text: e.answer }) as never)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: band })
  await ui.press({ key: 'savvy-handover' })
  await clock.settle()
  expect(asked.length).toBe(1)
  expect(submitted).toEqual(['handover'])

  // A turn without the sentinel (the skill asked something) clears nothing.
  await $.turn.complete({ answer: 'Which task next?', reason: 'answer', durationMs: 1, isAborted: false, turnId: 't1' } as never)
  await clock.advance(2000)
  expect(commands).toEqual([])

  await $.turn.complete({ answer: HANDOVER_ANSWER, reason: 'answer', durationMs: 1, isAborted: false, turnId: 't2' } as never)
  await clock.advance(2000)
  expect(commands).toEqual(['clear'])
  expect(submitted).toEqual(['handover', 'Resume: finish the keep-warm toggle.\nRead handover.md first.'])
  await ui.unmount()
})

test('handover button: Cancel sends nothing', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-17T12:00:00Z') })
  const submitted: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const q = (e as { questions: { question: string }[] }).questions[0].question
    return { result: { questions: (e as { questions: unknown[] }).questions, answers: { [q]: 'Cancel' } } } as never
  })
  on('prompt.submit', async (_$, e) => {
    submitted.push(e.text)
    return { text: e.text } as never
  })
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: band })
  await ui.press({ key: 'savvy-handover' })
  await clock.settle()
  expect(submitted).toEqual([])
  await ui.unmount()
})
