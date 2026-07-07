import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { useMemo, useRef, useEffect } from 'react'
import { Text } from '@/primitives'
import {
  RecordingMode,
  useHasRecordingAccess,
  useRecordingStatuses,
} from '@/features/recording'
import { FeatureFlags } from '@/features/analytics/enums'
import { Button as RACButton } from 'react-aria-components'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { TRANSCRIPT_PLUGIN_ID } from '../transcript.plugin'
import { SCREEN_RECORDING_PLUGIN_ID } from '../screenRecording.plugin'
import { useRoomMetadata } from '../hooks/useRoomMetadata'
import { RecordingStatusIcon } from './RecordingStatusIcon'
import { useIsRecording } from '@livekit/components-react'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { useIsToolVisible } from '@/features/plugins'

export const RecordingStateToast = () => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'recordingStateToast',
  })

  const { openSubPanel } = useSidePanel()

  const lastKeyRef = useRef('')
  const announce = useScreenReaderAnnounce()

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

  const isTranscriptToolVisible = useIsToolVisible(TRANSCRIPT_PLUGIN_ID)
  const isScreenToolVisible = useIsToolVisible(SCREEN_RECORDING_PLUGIN_ID)

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
      announce(message)
    }
  }, [announce, key, t])

  if (!key) return null

  // Without a visible target panel the label degrades to plain text.
  const hasScreenRecordingAccessAndActive =
    isScreenRecordingActive && hasScreenRecordingAccess && isScreenToolVisible
  const hasTranscriptAccessAndActive =
    isTranscriptActive && hasTranscriptAccess && isTranscriptToolVisible

  return (
    <>
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
            onPress={() => openSubPanel(SCREEN_RECORDING_PLUGIN_ID)}
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
            onPress={() => openSubPanel(TRANSCRIPT_PLUGIN_ID)}
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
