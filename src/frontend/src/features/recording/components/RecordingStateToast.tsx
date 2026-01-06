import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { useMemo, useRef, useState, useEffect } from 'react'
import { Text } from '@/primitives'
import {
  RecordingMode,
  useHasRecordingAccess,
  useRecordingStatuses,
} from '@/features/recording'
import { FeatureFlags } from '@/features/analytics/enums'
import { Button as RACButton } from 'react-aria-components'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { useRoomMetadata } from '../hooks/useRoomMetadata'
import { RecordingStatusIcon } from './RecordingStatusIcon'
import { useIsRecording } from '@livekit/components-react'

export const RecordingStateToast = () => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'recordingStateToast',
  })

  const { openTranscript, openScreenRecording } = useSidePanel()

  const [srMessage, setSrMessage] = useState('')
  const lastKeyRef = useRef('')

  const hasTranscriptAccess = useHasRecordingAccess(
    RecordingMode.Transcript,
    FeatureFlags.Transcript
  )

  const hasScreenRecordingAccess = useHasRecordingAccess(
    RecordingMode.ScreenRecording,
    FeatureFlags.ScreenRecording
  )

  const {
    isStarted: isScreenRecordingStarted,
    isStarting: isScreenRecordingStarting,
    isActive: isScreenRecordingActive,
  } = useRecordingStatuses(RecordingMode.ScreenRecording)

  const {
    isStarted: isTranscriptStarted,
    isStarting: isTranscriptStarting,
    isActive: isTranscriptActive,
  } = useRecordingStatuses(RecordingMode.Transcript)

  const isStarted = isScreenRecordingStarted || isTranscriptStarted
  const isStarting = isTranscriptStarting || isScreenRecordingStarting

  const metadata = useRoomMetadata()
  const isRecording = useIsRecording()

  const key = useMemo(() => {
    if (!metadata?.recording_status || !metadata?.recording_mode) {
      return undefined
    }

    if (!isStarting && !isStarted) {
      return undefined
    }

    let status = metadata.recording_status

    if (isStarted && !isRecording) {
      status = 'starting'
    }

    return `${metadata.recording_mode}.${status}`
  }, [metadata, isStarted, isStarting, isRecording])

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

  if (!key) return null

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
        <RecordingStatusIcon
          isStarted={isStarted}
          isTranscriptActive={isTranscriptActive}
        />

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
