import { css } from '@/styled-system/css'

import { HStack } from '@/styled-system/jsx'
import { Text } from '@/primitives/Text'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/Avatar'
import { useLowerHandParticipant } from '../api/lowerHandParticipant'
import { getParticipantColor } from '@/features/rooms/utils/getParticipantColor'
import type { Participant } from 'livekit-client'
import { isLocal } from '@/utils/livekit'
import { RiHand } from '@remixicon/react'
import { Button } from '@/primitives'
import { AdminOrOwnerOnly } from '@/features/rooms/components/AdminOrOwnerOnly'

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
  const { t } = useTranslation('rooms')
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
      <HStack>
        <Avatar name={name} bgColor={getParticipantColor(participant)} />
        <Text
          variant={'sm'}
          className={css({
            userSelect: 'none',
            cursor: 'default',
            display: 'flex',
          })}
        >
          <span
            className={css({
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '120px',
              display: 'block',
            })}
          >
            {name}
          </span>
          {isLocal(participant) && (
            <span
              className={css({
                marginLeft: '.25rem',
                whiteSpace: 'nowrap',
              })}
            >
              ({t('participants.you')})
            </span>
          )}
        </Text>
      </HStack>
      <AdminOrOwnerOnly>
        <ActionButton participant={participant} name={name} />
      </AdminOrOwnerOnly>
    </HStack>
  )
}
