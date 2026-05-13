import { Button, Text } from '@/primitives'
import { HStack, VStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { Avatar } from '@/components/Avatar'
import { useTranslation } from 'react-i18next'
import { WaitingParticipant } from '@/features/rooms/api/listWaitingParticipants'
import { RiCloseLine, RiErrorWarningLine } from '@remixicon/react'
import { VisualOnlyTooltip } from '@/primitives/VisualOnlyTooltip'

export const WaitingParticipantListItem = ({
  participant,
  onAction,
}: {
  participant: WaitingParticipant
  onAction: (participant: WaitingParticipant, allowEntry: boolean) => void
}) => {
  const { t } = useTranslation('rooms')
  const anonymousLabel = t('identity.anonymous.tooltip')

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
        <VStack
          gap={0}
          alignItems="start"
          className={css({ flex: 1, minWidth: 0 })}
        >
          <HStack gap="0.2rem" alignItems="center">
            <Text
              variant="sm"
              margin={false}
              className={css({
                userSelect: 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                padding: '0.1rem 0.25rem',
                lineHeight: 1.2,
              })}
            >
              {participant.username}
            </Text>
            {!participant.is_authenticated && (
              <VisualOnlyTooltip
                tooltip={anonymousLabel}
                ariaLabel={anonymousLabel}
              >
                <span
                  className={css({
                    display: 'inline-flex',
                    alignItems: 'center',
                    cursor: 'help',
                  })}
                >
                  <RiErrorWarningLine size={14} color="#dc2626" />
                </span>
              </VisualOnlyTooltip>
            )}
          </HStack>
        </VStack>
      </HStack>
      <HStack gap="0.25rem" className={css({ flexShrink: '0' })}>
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
