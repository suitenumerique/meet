import { Button, Text } from '@/primitives'
import { HStack, VStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { Avatar } from '@/components/Avatar'
import { useTranslation } from 'react-i18next'
import { WaitingParticipant } from '@/features/rooms/api/listWaitingParticipants'
import { RiCloseLine } from '@remixicon/react'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { isEncryptedRoom } from '@/features/rooms/api/ApiRoom'
import { EncryptionBadge, getTrustLevelFromAttributes, FingerprintDialog } from '@/features/encryption'
import type { TrustLevel } from '@/features/encryption/types'
import { useState } from 'react'

function waitingParticipantTrustLevel(
  participant: WaitingParticipant,
  encryptionMode?: string,
): TrustLevel {
  // In basic mode, no PKI — only authenticated or anonymous
  // In advanced mode, would check vault keys (but waiting participants haven't joined yet)
  if (participant.is_authenticated) return 'authenticated'
  return 'anonymous'
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
  const encryptedRoom = isEncryptedRoom(roomData)
  const { t: tBadge } = useTranslation('rooms', { keyPrefix: 'encryption.badge' })
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const trustLevel = waitingParticipantTrustLevel(participant, roomData?.encryption_mode)
  const badgeTooltip = encryptedRoom ? tBadge(trustLevel) : undefined

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
          {encryptedRoom ? (
            <Button
              variant="greyscale"
              size="sm"
              tooltip={badgeTooltip}
              aria-label={badgeTooltip}
              onPress={() => setIsDialogOpen(true)}
              className={css({
                padding: '0.1rem 0.25rem !important',
                minWidth: 'auto !important',
                height: 'auto !important',
                gap: '0.15rem !important',
                borderRadius: '0.25rem !important',
                backgroundColor: 'transparent !important',
                color: 'greyscale.900 !important',
                cursor: 'pointer',
                '&[data-hovered]': {
                  backgroundColor: 'greyscale.100 !important',
                },
              })}
            >
              <EncryptionBadge
                isEncrypted={true}
                trustLevel={trustLevel}
              />
              <Text
                variant="sm"
                className={css({
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                })}
              >
                {participant.username}
              </Text>
            </Button>
          ) : (
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
          )}
          {encryptedRoom && (() => {
            const email = participant.is_authenticated && participant.email
              ? participant.email
              : null
            const label = email || t('participants.anonymous')
            return (
              <Button
                variant="greyscale"
                size="sm"
                tooltip={email || undefined}
                aria-label={label}
                className={css({
                  padding: '0 0.25rem !important',
                  minWidth: 'auto !important',
                  height: 'auto !important',
                  backgroundColor: 'transparent !important',
                  color: 'greyscale.500 !important',
                  fontSize: '0.7rem !important',
                  fontWeight: 'normal !important',
                  width: '100%',
                  minW: 0,
                  justifyContent: 'flex-start !important',
                  '&[data-hovered]': {
                    backgroundColor: 'transparent !important',
                  },
                })}
              >
                <span className={css({
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                })}>
                  {label}
                </span>
              </Button>
            )
          })()}
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
      {encryptedRoom && (
        <FingerprintDialog
          isOpen={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          participantName={participant.username}
          participantEmail={participant.email}
          suiteUserId={participant.suite_user_id}
          isAuthenticated={participant.is_authenticated}
          encryptionMode={roomData?.encryption_mode}
        />
      )}
    </HStack>
  )
}
