// Starbridge: one custom-drawn button. The desktop's native button takes no colours, so each of the
// HUD's buttons is a small region of its own: a tinted chip that brightens under the pointer and
// posts its action to the hooks module when clicked. No `$` here; `post` is the way back.
import type { ClientModule } from 'claude-code'

export type DeckButtonProps = {
  /** What the click asks the hooks module to do. */
  action: string
  label: string
  /** Text colour, resting background, and the background under the pointer. */
  fg: string
  bg: string
  hoverBg: string
}

type State = { hover: boolean; down: boolean }

const DeckButton: ClientModule<DeckButtonProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state ?? { hover: false, down: false }
  surface.onPointer(e => {
    if (e.type === 'enter' && !state.hover) surface.setState({ ...state, hover: true })
    else if (e.type === 'leave' && (state.hover || state.down)) surface.setState({ hover: false, down: false })
    else if (e.type === 'down' && e.button === 'left') surface.setState({ ...state, down: true })
    else if (e.type === 'up' && state.down) {
      surface.setState({ ...state, down: false })
      surface.post({ action: props.action })
    }
  })
  return Box({
    backgroundColor: state.hover ? props.hoverBg : props.bg,
    paddingX: 1,
    children: [Text({ color: props.fg, bold: true, children: [props.label] })],
  })
}

export default DeckButton
