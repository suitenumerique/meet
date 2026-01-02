import { useCallback, useEffect, useRef, useState } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { RemoteParticipant, RoomEvent } from 'livekit-client'
import { StyledToastContainer } from './Toast'
import { HStack, VStack } from '@/styled-system/jsx'
import { Avatar } from '@/components/Avatar'
import { Button, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { usePrevious } from '@/hooks/usePrevious'
import { useNotificationSound } from '../hooks/useSoundNotification'
import { NotificationType } from '../NotificationType'
import { decodeNotificationDataReceived } from '../utils'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { useRoomId } from '@/features/rooms/livekit/hooks/useRoomId'
import { getParticipantColor } from '@/features/rooms/utils/getParticipantColor'
import { RecordingMode, useStartRecording } from '@/features/recording'
import { RecordingStatus, recordingStore } from '@/stores/recording'
import { FeatureFlags } from '@/features/analytics/enums'
import { useHasRecordingAccess } from '@/features/recording/hooks/useHasRecordingAccess'
import { useNotifyParticipants } from '../hooks/useNotifyParticipants'
import posthog from 'posthog-js'

export const NOTIFICATION_DISPLAY_DURATION = 10000

interface TranscriptionRequest {
  participant: RemoteParticipant
  timestamp: number
}

export const TranscriptionRequestNotification = () => {
  const { triggerNotificationSound } = useNotificationSound()
  const { t } = useTranslation('notifications', {
    keyPrefix: 'transcriptionRequest',
  })
  const room = useRoomContext()
  const isAdminOrOwner = useIsAdminOrOwner()
  const { isAdminOpen } = useSidePanel()
  const roomId = useRoomId()

  const [requests, setRequests] = useState<TranscriptionRequest[]>([])
  const prevRequests = usePrevious<TranscriptionRequest[] | undefined>(requests)
  const [showQuickActionsMessage, setShowQuickActionsMessage] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const hasTranscriptAccess = useHasRecordingAccess(
    RecordingMode.Transcript,
    FeatureFlags.Transcript
  )

  const { mutateAsync: startRecordingRoom } = useStartRecording()
  const { notifyParticipants } = useNotifyParticipants()

  const handleDataReceived = useCallback(
    (payload: Uint8Array, participant?: RemoteParticipant) => {
      if (!participant || participant.isLocal || !isAdminOrOwner) return

      const notification = decodeNotificationDataReceived(payload)
      if (notification?.type === NotificationType.TranscriptionRequested) {
        // Check if we already have a request from this participant
        setRequests((prev) => {
          const existing = prev.find(
            (req) => req.participant.identity === participant.identity
          )
          if (existing) return prev
          return [...prev, { participant, timestamp: Date.now() }]
        })
      }
    },
    [isAdminOrOwner]
  )

  useEffect(() => {
    if (!isAdminOrOwner) return

    room.on(RoomEvent.DataReceived, handleDataReceived)
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived)
    }
  }, [isAdminOrOwner, room, handleDataReceived])

  useEffect(() => {
    // Show notification when the first request arrives
    if (
      requests.length > 0 &&
      (!prevRequests || prevRequests.length === 0) &&
      !isAdminOpen
    ) {
      setShowQuickActionsMessage(true)
      triggerNotificationSound(NotificationType.TranscriptionRequested)

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        setShowQuickActionsMessage(false)
        timerRef.current = null
      }, NOTIFICATION_DISPLAY_DURATION)
    } else if (requests.length !== prevRequests?.length) {
      setShowQuickActionsMessage(false)
    }
  }, [requests, prevRequests, isAdminOpen, triggerNotificationSound])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (isAdminOpen) {
      setShowQuickActionsMessage(false)
    }
  }, [isAdminOpen])

  // Remove requests when participants disconnect
  const handleParticipantDisconnected = useCallback(
    (participant: RemoteParticipant) => {
      setRequests((prev) => {
        const participantIdentity = participant.identity
        return prev.filter(
          (req) => req.participant.identity !== participantIdentity
        )
      })
    },
    []
  )

  useEffect(() => {
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
    return () => {
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
    }
  }, [room, handleParticipantDisconnected])

  const handleStartTranscription = async () => {
    if (!roomId || !hasTranscriptAccess) return

    try {
      await startRecordingRoom({ id: roomId, mode: RecordingMode.Transcript })
      recordingStore.status = RecordingStatus.TRANSCRIPT_STARTING
      await notifyParticipants({
        type: NotificationType.TranscriptionStarted,
      })
      posthog.capture('transcript-started', { source: 'request' })
      // Clear all requests after starting
      setRequests([])
      setShowQuickActionsMessage(false)
    } catch (error) {
      console.error('Failed to start transcription:', error)
    }
  }

  const handleDismiss = () => {
    if (requests.length > 0) {
      // Remove the first request
      setRequests((prev) => prev.slice(1))
      setShowQuickActionsMessage(false)
    }
  }

  if (!isAdminOrOwner || !requests.length) return null

  const firstRequest = requests[0]
  const participantName =
    firstRequest.participant.name ||
    firstRequest.participant.identity ||
    'Unknown'
  const participantColor = getParticipantColor(firstRequest.participant)

  return (
    <StyledToastContainer role="alert">
      <HStack
        padding={'1rem'}
        gap={'1rem'}
        role={'alertdialog'}
        aria-label={t('message', { name: participantName })}
        aria-modal={false}
      >
        {showQuickActionsMessage ? (
          <VStack gap={'1rem'} alignItems={'start'}>
            <Text
              variant="paragraph"
              margin={false}
              style={{
                minWidth: '15rem',
              }}
            >
              {t('message', { name: participantName })}
            </Text>
            <HStack gap="1rem">
              <Avatar
                name={participantName}
                bgColor={participantColor}
                context="list"
                notification
              />
              <Text
                variant="sm"
                margin={false}
                className={css({
                  maxWidth: '10rem',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'normal',
                })}
              >
                {participantName}
              </Text>
            </HStack>
            <HStack gap="0.25rem" marginLeft="auto">
              {hasTranscriptAccess && (
                <Button
                  size="sm"
                  variant="text"
                  className={css({
                    color: 'primary.300',
                  })}
                  onPress={handleStartTranscription}
                >
                  {t('start')}
                </Button>
              )}
              <Button
                size="sm"
                variant="text"
                className={css({
                  color: 'primary.300',
                })}
                onPress={handleDismiss}
              >
                {t('dismiss')}
              </Button>
            </HStack>
          </VStack>
        ) : (
          <>
            <HStack gap={0}>
              <Avatar
                name={participantName}
                bgColor={participantColor}
                context="list"
                notification
              />
              {requests.length > 1 && (
                <span
                  className={css({
                    width: '32px',
                    height: '32px',
                    fontSize: '1rem',
                    color: 'white',
                    display: 'flex',
                    borderRadius: '50%',
                    justifyContent: 'center',
                    alignItems: 'center',
                    background: 'primaryDark.100',
                    border: '2px solid white',
                    marginLeft: '-10px',
                  })}
                >
                  +{requests.length - 1}
                </span>
              )}
            </HStack>
            <Text
              variant="paragraph"
              margin={false}
              wrap={'balance'}
              style={{
                maxWidth: requests.length === 1 ? '10rem' : '15rem',
              }}
            >
              {requests.length > 1
                ? t('multiple', { count: requests.length })
                : t('message', { name: participantName })}
            </Text>
            {hasTranscriptAccess && (
              <Button
                size="sm"
                variant="text"
                className={css({
                  color: 'primary.300',
                })}
                onPress={handleStartTranscription}
              >
                {t('start')}
              </Button>
            )}
          </>
        )}
      </HStack>
    </StyledToastContainer>
  )
}
