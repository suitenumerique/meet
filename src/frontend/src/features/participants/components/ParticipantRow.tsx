import { css } from '@/styled-system/css'

import { HStack, VStack } from '@/styled-system/jsx'
import { Text } from '@/primitives/Text'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/Avatar'
import { getParticipantColor } from '@/features/rooms/utils/getParticipantColor'
import {
  getParticipantIsRoomAdmin,
  getParticipantIsRoomOwner,
  getParticipantIsRoomMember,
} from '@/features/rooms/utils/getParticipantIsRoomAdminOrOwner'
import { type LocalParticipant, type Participant, Track } from 'livekit-client'
import { isLocal } from '@/utils/livekit'
import {
  useIsSpeaking,
  useTrackMutedIndicator,
} from '@livekit/components-react'
import Source = Track.Source
import { RiMicFill, RiMicOffFill } from '@remixicon/react'
import { Button } from '@/primitives'
import { useCanMute } from '@/features/rooms/livekit/hooks/useCanMute'
import { ParticipantMenuButton } from './menu/ParticipantMenuButton'
import { PinBadge } from './PinBadge'
import { UnauthenticatedBadge } from './UnauthenticatedBadge'
import { openMuteDialog } from '@/stores/muteDialog'
import { ParticipantName } from './ParticipantName'

type MicIndicatorProps = {
  participant: Participant
}

const MicIndicator = ({ participant }: MicIndicatorProps) => {
  const { t } = useTranslation('rooms')
  const { isMuted } = useTrackMutedIndicator({
    participant: participant,
    source: Source.Microphone,
  })

  const canMute = useCanMute(participant)
  const isSpeaking = useIsSpeaking(participant)
  const name = participant.name || participant.identity

  const label = isLocal(participant)
    ? t('participants.muteYourself')
    : t('participants.muteParticipant', {
        name,
      })

  return (
    <Button
      square
      variant="greyscale"
      size="sm"
      tooltip={label}
      aria-label={label}
      isDisabled={isMuted || !canMute}
      onPress={async () =>
        !isMuted && isLocal(participant)
          ? await (participant as LocalParticipant)?.setMicrophoneEnabled(false)
          : openMuteDialog(participant)
      }
      data-attr="participants-mute"
    >
      {isMuted ? (
        <RiMicOffFill color={'gray'} aria-hidden={true} />
      ) : (
        <RiMicFill
          className={css({
            color: isSpeaking ? 'primaryDark.300' : 'primaryDark.50',
            animation: isSpeaking
              ? 'pulse_background 800ms infinite'
              : undefined,
          })}
          aria-hidden={true}
        />
      )}
    </Button>
  )
}

type ParticipantListItemProps = {
  participant: Participant
}

export const ParticipantRow = ({ participant }: ParticipantListItemProps) => {
  const { t } = useTranslation('rooms')
  const name = participant.name || participant.identity
  return (
    <HStack
      role="listitem"
      justify="space-between"
      id={participant.identity}
      className={css({
        padding: '0.25rem 0',
        width: 'full',
      })}
    >
      <HStack flex="1" minW="0">
        <div className={css({ position: 'relative', flexShrink: 0 })}>
          <Avatar name={name} bgColor={getParticipantColor(participant)} />
          <PinBadge participant={participant} />
          <UnauthenticatedBadge participant={participant} />
        </div>
        <VStack gap={0} alignItems="start" minW="0" flex="1">
          <ParticipantName
            displayedName={name}
            isLocal={isLocal(participant)}
          />
          <Text variant="xsNote">
            {getParticipantIsRoomOwner(participant) && t('participants.host')}
            {getParticipantIsRoomAdmin(participant) && t('participants.cohost')}
            {getParticipantIsRoomMember(participant) &&
              t('participants.member')}
          </Text>
        </VStack>
      </HStack>
      <HStack flexShrink={0}>
        <MicIndicator participant={participant} />
        <ParticipantMenuButton participant={participant} />
      </HStack>
    </HStack>
  )
}
