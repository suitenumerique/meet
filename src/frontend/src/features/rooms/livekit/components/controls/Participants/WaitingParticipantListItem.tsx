import { Button, Text } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { Avatar } from '@/components/Avatar'
import { useTranslation } from 'react-i18next'
import { WaitingParticipant } from '@/features/rooms/api/listWaitingParticipants'
import { RiCloseLine, RiShieldCheckLine, RiAlertLine } from '@remixicon/react'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { EncryptionTrustModal } from '@/features/encryption'
import { useState } from 'react'

const EncryptionTrustIndicator = ({
  isAuthenticated,
  participantName,
}: {
  isAuthenticated: boolean
  participantName: string
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participants.waiting' })
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <Button
        variant="tertiaryText"
        size="sm"
        square
        tooltip={
          isAuthenticated
            ? t('trust.authenticated')
            : t('trust.anonymous')
        }
        aria-label={
          isAuthenticated
            ? t('trust.authenticated')
            : t('trust.anonymous')
        }
        onPress={() => setIsModalOpen(true)}
        className={css({
          padding: '0.15rem !important',
          minWidth: 'auto !important',
          width: '1.5rem !important',
          height: '1.5rem !important',
          borderRadius: '50% !important',
          backgroundColor: isAuthenticated
            ? '#eff6ff !important'
            : '#fffbeb !important',
          flexShrink: 0,
        })}
      >
        {isAuthenticated ? (
          <RiShieldCheckLine size={16} color="#3b82f6" />
        ) : (
          <RiAlertLine size={16} color="#f59e0b" />
        )}
      </Button>
      <EncryptionTrustModal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        participantName={participantName}
        isAuthenticated={isAuthenticated}
      />
    </>
  )
}

export const WaitingParticipantListItem = ({
  participant,
  onAction,
}: {
  participant: WaitingParticipant
  onAction: (participant: WaitingParticipant, allowEntry: boolean) => void
}) => {
  const { t } = useTranslation('rooms')
  const roomData = useRoomData()
  const isEncryptedRoom = roomData?.encryption_enabled ?? false

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
        {isEncryptedRoom && (
          <EncryptionTrustIndicator
            isAuthenticated={participant.is_authenticated}
            participantName={participant.username}
          />
        )}
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            flex: '1',
            minWidth: '0',
          })}
        >
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
                width: '100%',
                display: 'block',
              })}
            >
              {participant.username}
            </span>
          </Text>
          {isEncryptedRoom && participant.email && (
            <Text
              variant={'sm'}
              className={css({
                fontSize: '0.7rem',
                color: 'greyscale.500',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              })}
            >
              {participant.email}
            </Text>
          )}
        </div>
      </HStack>
      <HStack
        gap="0.25rem"
        className={css({
          flexShrink: '0',
        })}
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
