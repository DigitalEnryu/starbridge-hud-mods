// Starbridge: one custom-drawn button. The desktop's native button takes no colours, so each of the
// HUD's buttons is a small region of its own: a key with a glowing outline that brightens under the
// pointer and posts its action to the hooks module when clicked. No `$` here; `post` is the way back.
import type { ClientModule } from 'claude-code'

export type DeckButtonProps = {
  /** What the click asks the hooks module to do. */
  action: string
  /** A symbol drawn before the label in its own colour (the Walkman play and stop marks). */
  glyph?: string
  glyphColor?: string
  label: string
  /** Label colour, resting fill, fill under the pointer. */
  fg: string
  bg: string
  hoverBg: string
  /** The outline at rest and under the pointer; absent, the key is drawn flat with no outline. */
  edge?: string
  hoverEdge?: string
  /**
   * Ghost mode: draw nothing visible, `cells` wide, laid over an image of the key. It still takes the
   * pointer, posting `{ hover }` as it enters and leaves (so the image can glow) and `{ action }` on a click.
   */
  ghost?: boolean
  cells?: number
}

type State = { hover: boolean; down: boolean }

const DeckButton: ClientModule<DeckButtonProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state ?? { hover: false, down: false }
  surface.onPointer(e => {
    if (e.type === 'enter' && !state.hover) {
      surface.setState({ ...state, hover: true })
      if (props.ghost) surface.post({ hover: props.action })
    } else if (e.type === 'leave' && (state.hover || state.down)) {
      surface.setState({ hover: false, down: false })
      if (props.ghost) surface.post({ hover: null })
    }
    else if (e.type === 'down' && e.button === 'left') surface.setState({ ...state, down: true })
    else if (e.type === 'up' && state.down) {
      surface.setState({ ...state, down: false })
      surface.post({ action: props.action })
    }
  })
  if (props.ghost) return Text({ children: [' '.repeat(Math.max(1, props.cells ?? 1))] })
  const children = [
    ...(props.glyph ? [Text({ color: props.glyphColor ?? props.fg, bold: true, children: [`${props.glyph} `] })] : []),
    Text({ color: props.fg, bold: true, children: [props.label] }),
  ]
  const outline = props.edge
    ? { borderStyle: 'round', borderColor: state.hover ? props.hoverEdge ?? props.edge : props.edge }
    : {}
  return Box({
    ...outline,
    flexDirection: 'row',
    backgroundColor: state.hover ? props.hoverBg : props.bg,
    paddingX: 1,
    children,
  })
}

export default DeckButton
