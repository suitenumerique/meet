import { useConnectionState, useRoomContext } from '@livekit/components-react'
import { Button, Icon } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { ConnectionState } from 'livekit-client'
import { reportError } from '@/features/analytics/telemetry'

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
        room.disconnect(true).catch((e) =>
          reportError('disconnect_failure', e, {
            context: 'An error occurred while disconnecting:',
          })
        )
      }}
      data-attr="controls-leave"
    >
      <Icon
        name="phone-filled"
        style={{
          transform: 'rotate(135deg)',
        }}
      />
    </Button>
  )
}
