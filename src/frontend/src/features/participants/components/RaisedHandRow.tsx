import { css } from '@/styled-system/css'

import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/Avatar'
import { useLowerHandParticipant } from '../api/lowerHandParticipant'
import { getParticipantColor } from '@/features/rooms/utils/getParticipantColor'
import type { Participant } from 'livekit-client'
import { isLocal } from '@/utils/livekit'
import { RiHand } from '@remixicon/react'
import { Button } from '@/primitives'
import { AdminOrOwnerOnly } from '@/features/rooms/components/AdminOrOwnerOnly'
import { ParticipantName } from './ParticipantName'

const ActionButton = ({
  participant,
  name,
}: {
  participant: Participant
  name: string
}) => {
  const { t } = useTranslation('rooms')
  const { lowerHandParticipant } = useLowerHandParticipant()

  return (
    <Button
      square
      variant="greyscale"
      size="sm"
      onPress={() => lowerHandParticipant(participant)}
      aria-label={t('participants.lowerParticipantHand', { name })}
      tooltip={t('participants.lowerParticipantHand', { name })}
      data-attr="participants-lower-hand"
    >
      <RiHand />
    </Button>
  )
}

type HandRaisedListItemProps = {
  participant: Participant
}

export const RaisedHandRow = ({ participant }: HandRaisedListItemProps) => {
  const name = participant.name || participant.identity
  return (
    <HStack
      role="listitem"
      justify="space-between"
      key={participant.identity}
      id={participant.identity}
      className={css({
        padding: '0.25rem 0',
        width: 'full',
      })}
    >
      <HStack flex="1" minW="0" overflow="hidden">
        <Avatar name={name} bgColor={getParticipantColor(participant)} />
        <ParticipantName displayedName={name} isLocal={isLocal(participant)} />
      </HStack>
      <HStack flexShrink={0}>
        <AdminOrOwnerOnly>
          <ActionButton participant={participant} name={name} />
        </AdminOrOwnerOnly>
      </HStack>
    </HStack>
  )
}
