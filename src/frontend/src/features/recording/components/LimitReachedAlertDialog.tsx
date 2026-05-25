import { useTranslation } from 'react-i18next'
import { Button, Dialog, P } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { useEffect, useMemo, useState } from 'react'
import { NotificationType } from '@/features/notifications'
import { AdminOrOwnerOnly } from '@/features/rooms/components/AdminOrOwnerOnly'
import { RoomEvent } from 'livekit-client'
import { decodeNotificationDataReceived } from '@/features/notifications/utils'
import { useRoomContext } from '@livekit/components-react'
import { useHumanizeDuration } from '@/hooks/useHumanizeDuration'
import { useConfig } from '@/api/useConfig'

// Isolated into its own component so the `useHumanizeDuration` hook (and the
// `humanize-duration` library it pulls in) is only loaded when the modal is
// actually opened.
const LimitDescription = () => {
  const { data } = useConfig()
  const { t } = useTranslation('rooms', {
    keyPrefix: 'recordingStateToast.limitReachedAlert',
  })
  const formatter = useHumanizeDuration()

  const formattedDuration = useMemo(
    () => formatter(data?.recording?.max_duration),
    [formatter, data?.recording?.max_duration]
  )

  return (
    <P>
      {t('description', {
        duration_message: formattedDuration
          ? t('durationMessage', {
              duration: formattedDuration,
            })
          : '',
      })}
    </P>
  )
}

const LimitReachedAlertDialogContent = () => {
  const [isOpen, setIsOpen] = useState(false)
  const { t } = useTranslation('rooms', {
    keyPrefix: 'recordingStateToast.limitReachedAlert',
  })
  const room = useRoomContext()

  useEffect(() => {
    const handleLimitNotification = (payload: Uint8Array) => {
      const notification = decodeNotificationDataReceived(payload)
      if (
        notification?.type === NotificationType.TranscriptionLimitReached ||
        notification?.type === NotificationType.ScreenRecordingLimitReached
      ) {
        setIsOpen(true)
      }
    }
    room.on(RoomEvent.DataReceived, handleLimitNotification)

    return () => {
      room.off(RoomEvent.DataReceived, handleLimitNotification)
    }
  }, [room])

  return (
    <Dialog isOpen={isOpen} role="alertdialog" title={t('title')}>
      <LimitDescription />
      <HStack gap={1}>
        <Button variant="text" size="sm" onPress={() => setIsOpen(false)}>
          {t('button')}
        </Button>
      </HStack>
    </Dialog>
  )
}

export const LimitReachedAlertDialog = () => (
  <AdminOrOwnerOnly>
    <LimitReachedAlertDialogContent />
  </AdminOrOwnerOnly>
)
