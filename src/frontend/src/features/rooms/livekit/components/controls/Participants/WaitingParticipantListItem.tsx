import { Button, Text } from '@/primitives'
import { HStack, VStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { Avatar } from '@/components/Avatar'
import { useTranslation } from 'react-i18next'
import { WaitingParticipant } from '@/features/rooms/api/listWaitingParticipants'
import { RiCloseLine } from '@remixicon/react'
import { IdentityBadge } from '@/features/encryption'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'

export const WaitingParticipantListItem = ({
  participant,
  onAction,
}: {
  participant: WaitingParticipant
  onAction: (participant: WaitingParticipant, allowEntry: boolean) => void
}) => {
  const { t } = useTranslation('rooms')
  const roomData = useRoomData()
  const showIdentityBadge = !!roomData?.is_encrypted

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
      <HStack
        className={css({
          flex: '1',
          minWidth: '0',
          gap: '0.35rem',
        })}
      >
        <Avatar name={participant.username} bgColor={participant.color} />
        <VStack gap={0} alignItems="start" className={css({ flex: 1, minWidth: 0 })}>
          <Text
            variant="sm"
            className={css({
              userSelect: 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              padding: '0.1rem 0.25rem',
            })}
          >
            {participant.username}
          </Text>
          {showIdentityBadge && (
            <IdentityBadge isAuthenticated={participant.is_authenticated} />
          )}
        </VStack>
      </HStack>
      <HStack
        gap="0.25rem"
        className={css({ flexShrink: '0' })}
      >
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
