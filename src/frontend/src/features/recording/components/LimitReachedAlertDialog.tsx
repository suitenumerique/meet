import { useTranslation } from 'react-i18next'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/primitives'
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
    <p>
      {t('description', {
        duration_message: formattedDuration
          ? t('durationMessage', {
              duration: formattedDuration,
            })
          : '',
      })}
    </p>
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
    <Dialog isOpen={isOpen} role="alertdialog" type="alert">
      <DialogTitle>{t('title')}</DialogTitle>
      <DialogBody>
        <LimitDescription />
      </DialogBody>
      <DialogActions>
        <Button variant="primary" size="sm" onPress={() => setIsOpen(false)}>
          {t('button')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export const LimitReachedAlertDialog = () => (
  <AdminOrOwnerOnly>
    <LimitReachedAlertDialogContent />
  </AdminOrOwnerOnly>
)
