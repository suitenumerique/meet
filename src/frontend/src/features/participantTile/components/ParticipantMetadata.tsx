import {
  useRaisedHand,
  useRaisedHandPosition,
} from '@/features/rooms/livekit/hooks/useRaisedHand'
import {
  ConnectionQualityIndicator,
  LockLockedIcon,
  ScreenShareIcon,
  useIsEncrypted,
  useParticipantInfo,
} from '@livekit/components-react'
import { HStack } from '@/styled-system/jsx'
import { Participant } from 'livekit-client'
import { MutedMicIndicator } from './MutedMicIndicator'
import { RiHand } from '@remixicon/react'
import { ParticipantName } from './ParticipantName'

export const ParticipantMetadata = ({
  participant,
  isScreenShare,
}: {
  participant: Participant
  isScreenShare: boolean
}) => {
  const { identity, name } = useParticipantInfo({ participant })
  const isEncrypted = useIsEncrypted(participant)
  const { isHandRaised } = useRaisedHand({ participant })
  const { positionInQueue, firstInQueue } = useRaisedHandPosition({
    participant,
  })

  return (
    <div className="lk-participant-metadata">
      <HStack gap={0.25}>
        {!isScreenShare && <MutedMicIndicator participant={participant} />}
        <div
          className="lk-participant-metadata-item"
          style={{
            padding: '0.1rem 0.25rem',
            backgroundColor:
              isHandRaised && !isScreenShare
                ? firstInQueue
                  ? '#fde047'
                  : 'white'
                : undefined,
            color: isHandRaised && !isScreenShare ? 'black' : undefined,
            transition: 'background 200ms ease, color 400ms ease',
          }}
        >
          {isHandRaised && !isScreenShare && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.1rem',
              }}
            >
              <span>{positionInQueue}</span>
              <RiHand
                color="black"
                size={16}
                style={{
                  marginRight: '0.4rem',
                  marginLeft: '0.1rem',
                  minWidth: '16px',
                  animationDuration: '300ms',
                  animationName: 'wave_hand',
                  animationIterationCount: '2',
                }}
              />
            </span>
          )}
          {isScreenShare && (
            <ScreenShareIcon
              style={{
                maxWidth: '20px',
                width: '100%',
              }}
            />
          )}
          {isEncrypted && !isScreenShare && (
            <LockLockedIcon style={{ marginRight: '0.25rem' }} />
          )}
          <div className="lk-participant-name-wrapper">
            <ParticipantName
              displayedName={name != '' ? name : identity}
              isScreenShare={isScreenShare}
            />
          </div>
        </div>
      </HStack>
      <ConnectionQualityIndicator className="lk-participant-metadata-item" />
    </div>
  )
}
