import { Participant } from 'livekit-client'

const DEFAULT_COLOR = 'rgb(87, 44, 216)'

const HSL_REGEX =
  /^hsl\(([0-9]|[1-9][0-9]|[1-2][0-9][0-9]|3[0-5][0-9]|360),\s*([5-7][0-9]|50|75)%,\s*([2-5][0-9]|60)%\)$/

function isValidHsl(colorString: string) {
  return HSL_REGEX.test(colorString)
}

export const getParticipantColor = (participant: Participant): string => {
  const attributes = participant.attributes

  if (!attributes?.color) {
    return DEFAULT_COLOR
  }

  if (!isValidHsl(attributes.color)) {
    console.warn('Invalid color value:', attributes.color)
    return DEFAULT_COLOR
  }

  return attributes.color
}
