import { Participant } from 'livekit-client'

const DEFAULT_COLOR = 'rgb(87, 44, 216)'

const HSL_REGEX =
  /^hsl\(([0-9]|[1-9][0-9]|[1-2][0-9][0-9]|3[0-5][0-9]|360),\s*([5-7][0-9]|50|75)%,\s*([2-5][0-9]|60)%\)$/

function isValidHsl(colorString: string) {
  return HSL_REGEX.test(colorString)
}

export const getParticipantColor = (participant: Participant): string => {
  const { metadata } = participant

  if (!metadata) {
    return DEFAULT_COLOR
  }

  let parsedMetadata: unknown

  try {
    parsedMetadata = JSON.parse(metadata)
  } catch (error) {
    console.error('Invalid JSON in participant metadata:', error)
    return DEFAULT_COLOR
  }

  if (!parsedMetadata || typeof parsedMetadata !== 'object') {
    return DEFAULT_COLOR
  }

  const colorValue = (parsedMetadata as Record<string, unknown>)['color']

  if (typeof colorValue !== 'string' || !isValidHsl(colorValue)) {
    console.error('Invalid color value:', colorValue)
    return DEFAULT_COLOR
  }

  return colorValue
}
