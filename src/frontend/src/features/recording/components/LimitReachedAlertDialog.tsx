import { useTranslation } from 'react-i18next'
import { Button, Dialog, P } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { useHumanizeRecordingMaxDuration } from '@/features/recording'
import { useEffect, useState } from 'react'
import { NotificationType } from '@/features/notifications'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { RoomEvent } from 'livekit-client'
import { decodeNotificationDataReceived } from '@/features/notifications/utils'
import { useRoomContext } from '@livekit/components-react'

export const LimitReachedAlertDialog = () => {
  const [isAlertOpen, setIsAlertOpen] = useState(false)

  const { t } = useTranslation('rooms', {
    keyPrefix: 'recordingStateToast.limitReachedAlert',
  })

  const room = useRoomContext()
  const isAdminOrOwner = useIsAdminOrOwner()
  const maxDuration = useHumanizeRecordingMaxDuration()

  useEffect(() => {
    const handleDataReceived = (payload: Uint8Array) => {
      if (!isAdminOrOwner) return

      const notification = decodeNotificationDataReceived(payload)

      if (
        notification?.type === NotificationType.TranscriptionLimitReached ||
        notification?.type === NotificationType.ScreenRecordingLimitReached
      ) {
        setIsAlertOpen(true)
      }
    }

    room.on(RoomEvent.DataReceived, handleDataReceived)

    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived)
    }
  }, [room, isAdminOrOwner])

  if (!isAdminOrOwner) return null

  return (
    <Dialog isOpen={isAlertOpen} role="alertdialog" title={t('title')}>
      <P>
        {t('description', {
          duration_message: maxDuration
            ? t('durationMessage', {
                duration: maxDuration,
              })
            : '',
        })}
      </P>
      <HStack gap={1}>
        <Button variant="text" size="sm" onPress={() => setIsAlertOpen(false)}>
          {t('button')}
        </Button>
      </HStack>
    </Dialog>
  )
}
