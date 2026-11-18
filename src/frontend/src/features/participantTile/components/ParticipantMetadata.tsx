import {
  LockLockedIcon,
  ScreenShareIcon,
  useIsEncrypted,
} from '@livekit/components-react'
import { HStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { Participant } from 'livekit-client'
import { ConnectionQualityIndicator } from './ConnectionQualityIndicator'
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
    <div
      data-theme="dark"
      className={css({
        // height shared by the name, the mic and the connection indicators
        '--metadata-item-size': '22px',
        position: 'absolute',
        right: '0.25rem',
        bottom: '0.25rem',
        left: '0.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem',
        lineHeight: 1,
      })}
    >
      <HStack gap="3xs" flex={1} minWidth={0}>
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
          <div className={css({ minWidth: 0 })}>
            <ParticipantName
              displayedName={displayedName}
              isScreenShare={isScreenShare}
            />
          </div>
        </RaisedHandMetadataWrapper>
      </HStack>
      <ConnectionQualityIndicator participant={participant} />
    </div>
  )
}
