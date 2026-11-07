/**
 * Do not offer pop-out windows on mobile browsers or touch-first devices.
 * A desktop browser with a secondary touch screen remains supported.
 */
export const canDetachParticipants = (
  isMobileBrowser: boolean,
  primaryPointerIsCoarse: boolean
) => !isMobileBrowser && !primaryPointerIsCoarse
