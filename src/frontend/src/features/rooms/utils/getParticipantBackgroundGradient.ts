/**
 * Builds a radial gradient from the participant's avatar color:
 * brighter in the center (where the avatar sits), darker at the edges.
 * Mixed in oklch so the color stays vivid as it darkens instead of greying out.
 */
export const getParticipantBackgroundGradient = (color: string): string =>
  `radial-gradient(circle at 50% 50%,
    color-mix(in oklch, ${color} 82%, white) 0%,
    color-mix(in oklch, ${color} 90%, white) 8%,
    ${color} 35%,
    color-mix(in oklch, ${color} 85%, black) 65%,
    color-mix(in oklch, ${color} 65%, black) 100%)`
