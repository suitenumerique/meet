import { css } from '@/styled-system/css'

import { HStack } from '@/styled-system/jsx'
import { Text } from '@/primitives/Text'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/Avatar'
import { useLowerHandParticipant } from '@/features/rooms/api/lowerHandParticipant'
import { getParticipantColor } from '@/features/rooms/utils/getParticipantColor'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { Participant } from 'livekit-client'
import { isLocal } from '@/utils/livekit'
import { RiHand } from '@remixicon/react'
import { Button } from '@/primitives'

type HandRaisedListItemProps = {
  participant: Participant
}

export const HandRaisedListItem = ({
  participant,
}: HandRaisedListItemProps) => {
  const { t } = useTranslation('rooms')
  const name = participant.name || participant.identity

  const { lowerHandParticipant } = useLowerHandParticipant()
  const isAdminOrOwner = useIsAdminOrOwner()

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
      {isAdminOrOwner && (
        <Button
          square
          variant="greyscale"
          size="sm"
          onPress={() => lowerHandParticipant(participant)}
          tooltip={t('participants.lowerParticipantHand', { name })}
          data-attr="participants-lower-hand"
        >
          <RiHand />
        </Button>
      )}
    </HStack>
  )
}
