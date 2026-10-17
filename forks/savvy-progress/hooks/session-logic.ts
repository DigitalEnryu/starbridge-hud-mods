// Fork addition: pure helpers for the session row, kept apart so tests can call them directly.

/** The end-session skill's Step 8 closes with this line, outside the fenced resume prompt. */
export const SENTINEL = /Run \/clear, paste this in the new session/i

/** A button run lapses after this long, or after this many main-loop turns, whichever first. */
export const RUN_MAX_MS = 30 * 60 * 1000
export const RUN_MAX_TURNS = 3

/** The handover line sits at half the window. */
export const MARK = 0.5

/**
 * The resume prompt from a handover answer: the last fenced block before the sentinel line.
 * Null when the answer is not a finished handover, so nothing gets cleared by mistake.
 */
export function extractResume(answer: string): string | null {
  const at = answer.search(SENTINEL)
  if (at < 0) return null
  const before = answer.slice(0, at)
  const blocks = [...before.matchAll(/```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/g)]
  const last = blocks.at(-1)
  if (!last) return null
  const text = last[1].trim()
  return text.length > 0 ? text : null
}

/** Whether a button run is still live: started, not too old, not too many turns ago. */
export function isRunLive(run: { mode: string | null; turns: number; startedAt: number }, now: number): boolean {
  if (run.mode === null) return false
  if (now - run.startedAt > RUN_MAX_MS) return false
  return run.turns < RUN_MAX_TURNS
}

/** A text bar `width` cells wide, filled to `ratio`, with a marker cell at the 50% line. */
export function windowBar(ratio: number, width: number): string {
  const cells = Math.max(10, width)
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * cells)
  const mark = Math.round(MARK * cells)
  let out = ''
  for (let i = 0; i < cells; i++) {
    if (i === mark) out += '│'
    else out += i < filled ? '▓' : '░'
  }
  return out
}

/** Green under the line, amber past it, red near the end of the window. */
export function ctxColor(ratio: number): string {
  if (ratio >= 0.8) return '#e06c6c'
  if (ratio >= MARK) return '#e0a040'
  return '#5fbf8f'
}

/** 370000 -> "370k", 1000000 -> "1M". */
export function short(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`.replace('.0M', 'M')
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}
