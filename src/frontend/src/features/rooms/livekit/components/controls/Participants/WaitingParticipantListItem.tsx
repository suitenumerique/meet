import { Button, Text } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { Avatar } from '@/components/Avatar'
import { useTranslation } from 'react-i18next'
import { WaitingParticipant } from '@/features/rooms/api/listWaitingParticipants'

export const WaitingParticipantListItem = ({
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
      <HStack>
        <Avatar name={participant.username} bgColor={participant.color} />
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
            {participant.username}
          </span>
        </Text>
      </HStack>
      {/* FIXME - flex layout is broken when the participant name is long */}
      <HStack
        className={css({
          marginRight: '0.5rem',
        })}
      >
        <Button
          size="sm"
          variant="secondaryText"
          onPress={() => onAction(participant, true)}
          aria-label={t('waiting.accept.label', { name: participant.username })}
          data-attr="participants-accept"
        >
          {t('participants.waiting.accept.button')}
        </Button>
        <Button
          size="sm"
          variant="secondaryText"
          onPress={() => onAction(participant, false)}
          aria-label={t('waiting.deny.label', { name: participant.username })}
          data-attr="participants-deny"
        >
          {t('participants.waiting.deny.button')}
        </Button>
      </HStack>
    </HStack>
  )
}
