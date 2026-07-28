import { Button } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { Avatar } from '@/components/Avatar'
import { useTranslation } from 'react-i18next'
import { WaitingParticipant } from '../api/listWaitingParticipants'
import { RiCloseLine } from '@remixicon/react'
import { ParticipantName } from './ParticipantName'

export const WaitingParticipantRow = ({
  participant,
  onAction,
}: {
  participant: WaitingParticipant
  onAction: (participant: WaitingParticipant, allowEntry: boolean) => void
}) => {
  const { t } = useTranslation('rooms')

  return (
    <HStack
      role="listitem"
      justify="space-between"
      key={participant.id}
      id={participant.id}
      className={css({
        padding: '0.25rem 0',
        width: 'full',
      })}
    >
      <HStack flex="1" minW="0">
        <Avatar name={participant.username} bgColor={participant.color} />
        <ParticipantName displayedName={participant.username} isLocal={false} />
      </HStack>
      <HStack gap="0.25rem" flexShrink={0}>
        <Button
          size="sm"
          variant="tertiary"
          onPress={() => onAction(participant, true)}
          aria-label={t('waiting.accept.label', { name: participant.username })}
          data-attr="participants-accept"
        >
          {t('participants.waiting.accept.button')}
        </Button>
        <Button
          size="sm"
          square
          tooltip={t('participants.waiting.deny.button')}
          variant="secondaryText"
          onPress={() => onAction(participant, false)}
          aria-label={t('waiting.deny.label', { name: participant.username })}
          data-attr="participants-deny"
        >
          <RiCloseLine />
        </Button>
      </HStack>
    </HStack>
  )
}
