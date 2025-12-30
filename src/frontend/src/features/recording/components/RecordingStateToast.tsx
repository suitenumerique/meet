import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { useRoomContext } from '@livekit/components-react'
import { Spinner } from '@/primitives/Spinner'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Text } from '@/primitives'
import { RoomEvent } from 'livekit-client'
import { decodeNotificationDataReceived } from '@/features/notifications/utils'
import { NotificationType } from '@/features/notifications/NotificationType'
import { RecordingStatus, recordingStore } from '@/stores/recording'
import { RiRecordCircleLine } from '@remixicon/react'
import {
  RecordingMode,
  useHasRecordingAccess,
  useIsRecordingActive,
} from '@/features/recording'
import { FeatureFlags } from '@/features/analytics/enums'
import { Button as RACButton } from 'react-aria-components'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { LimitReachedAlertDialog } from './LimitReachedAlertDialog'

export const RecordingStateToast = () => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'recordingStateToast',
  })
  const room = useRoomContext()
  const isAdminOrOwner = useIsAdminOrOwner()

  const { openTranscript, openScreenRecording } = useSidePanel()
  const [isAlertOpen, setIsAlertOpen] = useState(false)

  const [srMessage, setSrMessage] = useState('')
  const lastKeyRef = useRef('')

  const recordingSnap = useSnapshot(recordingStore)

  const hasTranscriptAccess = useHasRecordingAccess(
    RecordingMode.Transcript,
    FeatureFlags.Transcript
  )

  const isTranscriptActive = useIsRecordingActive(RecordingMode.Transcript)

  const hasScreenRecordingAccess = useHasRecordingAccess(
    RecordingMode.ScreenRecording,
    FeatureFlags.ScreenRecording
  )

  const isScreenRecordingActive = useIsRecordingActive(
    RecordingMode.ScreenRecording
  )

  useEffect(() => {
    if (room.isRecording && recordingSnap.status == RecordingStatus.STOPPED) {
      recordingStore.status = RecordingStatus.ANY_STARTED
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.isRecording])

  useEffect(() => {
    const handleDataReceived = (payload: Uint8Array) => {
      const notification = decodeNotificationDataReceived(payload)

      if (!notification) return

      switch (notification.type) {
        case NotificationType.TranscriptionStarted:
          recordingStore.status = RecordingStatus.TRANSCRIPT_STARTING
          break
        case NotificationType.TranscriptionStopped:
          recordingStore.status = RecordingStatus.TRANSCRIPT_STOPPING
          break
        case NotificationType.TranscriptionLimitReached:
          if (isAdminOrOwner) setIsAlertOpen(true)
          recordingStore.status = RecordingStatus.TRANSCRIPT_STOPPING
          break
        case NotificationType.ScreenRecordingStarted:
          recordingStore.status = RecordingStatus.SCREEN_RECORDING_STARTING
          break
        case NotificationType.ScreenRecordingStopped:
          recordingStore.status = RecordingStatus.SCREEN_RECORDING_STOPPING
          break
        case NotificationType.ScreenRecordingLimitReached:
          if (isAdminOrOwner) setIsAlertOpen(true)
          recordingStore.status = RecordingStatus.SCREEN_RECORDING_STOPPING
          break
        default:
          return
      }
    }

    const handleRecordingStatusChanged = (status: boolean) => {
      if (!status) {
        recordingStore.status = RecordingStatus.STOPPED
      } else if (recordingSnap.status == RecordingStatus.TRANSCRIPT_STARTING) {
        recordingStore.status = RecordingStatus.TRANSCRIPT_STARTED
      } else if (
        recordingSnap.status == RecordingStatus.SCREEN_RECORDING_STARTING
      ) {
        recordingStore.status = RecordingStatus.SCREEN_RECORDING_STARTED
      } else {
        recordingStore.status = RecordingStatus.ANY_STARTED
      }
    }

    room.on(RoomEvent.DataReceived, handleDataReceived)
    room.on(RoomEvent.RecordingStatusChanged, handleRecordingStatusChanged)

    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived)
      room.off(RoomEvent.RecordingStatusChanged, handleRecordingStatusChanged)
    }
  }, [room, recordingSnap, setIsAlertOpen, isAdminOrOwner])

  const key = useMemo(() => {
    switch (recordingSnap.status) {
      case RecordingStatus.TRANSCRIPT_STARTED:
        return 'transcript.started'
      case RecordingStatus.TRANSCRIPT_STARTING:
        return 'transcript.starting'
      case RecordingStatus.SCREEN_RECORDING_STARTED:
        return 'screenRecording.started'
      case RecordingStatus.SCREEN_RECORDING_STARTING:
        return 'screenRecording.starting'
      case RecordingStatus.ANY_STARTED:
        return 'any.started'
      default:
        return
    }
  }, [recordingSnap])

  // Update screen reader message only when the key actually changes
  // This prevents duplicate announcements caused by re-renders
  useEffect(() => {
    if (key && key !== lastKeyRef.current) {
      lastKeyRef.current = key
      const message = t(key)
      setSrMessage(message)

      // Clear message after 3 seconds to prevent it from being announced again
      const timer = setTimeout(() => {
        setSrMessage('')
      }, 3000)

      return () => clearTimeout(timer)
    }
  }, [key, t])

  if (!key)
    return isAdminOrOwner ? (
      <LimitReachedAlertDialog
        isOpen={isAlertOpen}
        onClose={() => setIsAlertOpen(false)}
        aria-label="Recording limit exceeded"
      />
    ) : null

  const isStarted = key?.includes('started')

  const hasScreenRecordingAccessAndActive =
    isScreenRecordingActive && hasScreenRecordingAccess
  const hasTranscriptAccessAndActive = isTranscriptActive && hasTranscriptAccess

  return (
    <>
      {/* Screen reader only message to announce state changes once */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {srMessage}
      </div>

      {/* Visual banner (without aria-live to avoid duplicate announcements) */}
      <div
        className={css({
          display: 'flex',
          position: 'fixed',
          top: '10px',
          left: '10px',
          paddingY: '0.25rem',
          paddingX: '0.75rem 0.75rem',
          backgroundColor: 'danger.700',
          borderColor: 'white',
          border: '1px solid',
          color: 'white',
          borderRadius: '4px',
          gap: '0.5rem',
        })}
      >
        {isStarted ? (
          <RiRecordCircleLine
            size={20}
            className={css({
              animation: 'pulse_background 1s infinite',
            })}
          />
        ) : (
          <Spinner size={20} variant="dark" />
        )}

        {!hasScreenRecordingAccessAndActive &&
          !hasTranscriptAccessAndActive && (
            <Text
              variant={'sm'}
              className={css({
                fontWeight: '500 !important',
              })}
            >
              {t(key)}
            </Text>
          )}
        {hasScreenRecordingAccessAndActive && (
          <RACButton
            onPress={openScreenRecording}
            className={css({
              textStyle: 'sm !important',
              fontWeight: '500 !important',
              cursor: 'pointer',
            })}
          >
            {t(key)}
          </RACButton>
        )}
        {hasTranscriptAccessAndActive && (
          <RACButton
            onPress={openTranscript}
            className={css({
              textStyle: 'sm !important',
              fontWeight: '500 !important',
              cursor: 'pointer',
            })}
          >
            {t(key)}
          </RACButton>
        )}
      </div>
    </>
  )
}
