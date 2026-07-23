import {
  ConnectionQualityIndicator,
  LockLockedIcon,
  ScreenShareIcon,
  useIsEncrypted,
} from '@livekit/components-react'
import { HStack } from '@/styled-system/jsx'
import { Participant } from 'livekit-client'
import { MutedMicIndicator } from './MutedMicIndicator'
import { ParticipantName } from './ParticipantName'
import { RaisedHandMetadataWrapper } from './RaisedHandMetadataWrapper'

export const ParticipantMetadata = ({
  displayedName,
  participant,
  isScreenShare,
}: {
  displayedName: string
  participant: Participant
  isScreenShare: boolean
}) => {
  const isEncrypted = useIsEncrypted(participant)

  return (
    <div className="lk-participant-metadata">
      <HStack gap={0.25}>
        {!isScreenShare && <MutedMicIndicator participant={participant} />}
        <RaisedHandMetadataWrapper
          participant={participant}
          enabled={!isScreenShare}
        >
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
              displayedName={displayedName}
              isScreenShare={isScreenShare}
            />
          </div>
        </RaisedHandMetadataWrapper>
      </HStack>
      <ConnectionQualityIndicator className="lk-participant-metadata-item" />
    </div>
  )
}
