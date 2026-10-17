/** A button-started handover or end session, while it runs. */
export type SessionRun = {
  mode: 'handover' | 'end' | null
  /** Main-loop turns finished since the click; the run lapses after a few. */
  turns: number
  startedAt: number
}

/** A message held because the cache went cold, until the person chooses. */
export type HeldMessage = {
  text: string
  /** When the held message was sent. */
  at: number
}

/** Everything the HUD draws from. */
export type View = {
  percent: number | null
  tokens: number | null
  window: number | null
  sessionUsd: number | null
  model: string | null
  lastRequestAt: number
  warmOn: boolean
  pings: number
  pingUsd: number
  /** Times Keep warm bridged an idle stretch of an hour or more that would have gone cold. */
  saves: number
  savedUsd: number
  nextPingAt: number
  stopped: string | null
  hold: HeldMessage | null
  run: SessionRun
}

declare module 'claude-code' {
  interface PluginState {
    starbridge: {
      view: View
      /** Ticked every minute so countdowns move. */
      tick: number
    }
  }
}
