import { useConnectionState, useRoomContext } from '@livekit/components-react'
import { ConnectionState } from 'livekit-client'
import { useTranslation } from 'react-i18next'
import { styled } from '@/styled-system/jsx'

/**
 * Banner surfaced inside the PiP when the room connection degrades.
 *
 * Scoped to `Reconnecting` / `Disconnected` - the two states the user needs
 * to see while their attention is on the PiP rather than the main window.
 */
export const PipConnectionStateToast = () => {
  const room = useRoomContext()
  const state = useConnectionState(room)
  const { t } = useTranslation('rooms', {
    keyPrefix: 'options.items.pictureInPicture.connection',
  })

  const label =
    state === ConnectionState.Reconnecting
      ? t('reconnecting')
      : state === ConnectionState.Disconnected
        ? t('disconnected')
        : null

  if (!label) return null

  return (
    <Banner role="status" aria-live="polite">
      {label}
    </Banner>
  )
}

const Banner = styled('div', {
  base: {
    position: 'absolute',
    top: '0.5rem',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'greyscale.800',
    color: 'white',
    fontSize: '0.8125rem',
    lineHeight: 1.3,
    padding: '0.375rem 0.75rem',
    borderRadius: '6px',
    boxShadow:
      'rgba(0, 0, 0, 0.4) 0px 2px 6px 0px, rgba(0, 0, 0, 0.25) 0px 4px 12px 2px',
    zIndex: 1001,
    animation: 'fade 200ms',
  },
})
