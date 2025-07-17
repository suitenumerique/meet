import { useConnectionState, useRoomContext } from '@livekit/components-react'
import { Button } from '@/primitives'
import { RiPhoneFill } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { ConnectionState } from 'livekit-client'

export const LeaveButton = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls' })
  const room = useRoomContext()
  const connectionState = useConnectionState(room)
  return (
    <Button
      isDisabled={connectionState === ConnectionState.Disconnected}
      variant={'danger'}
      tooltip={t('leave')}
      aria-label={t('leave')}
      onPress={() => {
        room
          .disconnect(true)
          .catch((e) =>
            console.error('An error occurred while disconnecting:', e)
          )
      }}
      data-attr="controls-leave"
    >
      <RiPhoneFill
        style={{
          transform: 'rotate(135deg)',
        }}
      />
    </Button>
  )
}
