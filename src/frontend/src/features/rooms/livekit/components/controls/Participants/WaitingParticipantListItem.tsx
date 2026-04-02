import { Button, Text } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { Avatar } from '@/components/Avatar'
import { useTranslation } from 'react-i18next'
import { WaitingParticipant } from '@/features/rooms/api/listWaitingParticipants'
import {
  RiCloseLine,
  RiShieldCheckFill,
  RiShieldCheckLine,
  RiAlertLine,
  RiErrorWarningLine,
} from '@remixicon/react'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { isEncryptedRoom } from '@/features/rooms/api/ApiRoom'
import { FingerprintDialog } from '@/features/encryption'
import { useVaultClient } from '@/features/encryption'
import { useState, useEffect } from 'react'

type FingerprintBadgeStatus = 'loading' | 'trusted' | 'refused' | 'unknown' | 'no-key'

const EncryptionTrustIndicator = ({
  participant,
}: {
  participant: WaitingParticipant
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participants.waiting' })
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const { client: vaultClient } = useVaultClient()
  const [fpStatus, setFpStatus] = useState<FingerprintBadgeStatus>('loading')

  useEffect(() => {
    if (!vaultClient || !participant.suite_user_id) {
      setFpStatus(participant.is_authenticated ? 'loading' : 'no-key')
      return
    }

    let cancelled = false

    async function check() {
      try {
        const { publicKeys } = await vaultClient!.fetchPublicKeys([participant.suite_user_id!])
        if (cancelled) return

        if (!publicKeys[participant.suite_user_id!]) {
          setFpStatus('no-key')
          return
        }

        const { results } = await vaultClient!.checkFingerprints(
          { [participant.suite_user_id!]: '' }
        )
        if (cancelled) return

        const result = results.find((r) => r.userId === participant.suite_user_id)
        setFpStatus(result?.status ?? 'unknown')
      } catch {
        if (!cancelled) setFpStatus('no-key')
      }
    }

    check()
    return () => { cancelled = true }
  }, [vaultClient, participant.suite_user_id, participant.is_authenticated])

  const getBadge = () => {
    switch (fpStatus) {
      case 'trusted':
        return {
          icon: <RiShieldCheckFill size={16} color="#22c55e" />,
          bg: '#f0fdf4',
          tooltip: t('trust.verified'),
        }
      case 'refused':
        return {
          icon: <RiErrorWarningLine size={16} color="#ef4444" />,
          bg: '#fef2f2',
          tooltip: t('trust.refused'),
        }
      case 'unknown':
        return {
          icon: <RiShieldCheckLine size={16} color="#3b82f6" />,
          bg: '#eff6ff',
          tooltip: participant.is_authenticated
            ? t('trust.authenticated')
            : t('trust.anonymous'),
        }
      case 'no-key':
        return {
          icon: <RiAlertLine size={16} color="#f59e0b" />,
          bg: '#fffbeb',
          tooltip: participant.is_authenticated
            ? t('trust.authenticated')
            : t('trust.anonymous'),
        }
      default:
        return {
          icon: participant.is_authenticated
            ? <RiShieldCheckLine size={16} color="#3b82f6" />
            : <RiAlertLine size={16} color="#f59e0b" />,
          bg: participant.is_authenticated ? '#eff6ff' : '#fffbeb',
          tooltip: participant.is_authenticated
            ? t('trust.authenticated')
            : t('trust.anonymous'),
        }
    }
  }

  const badge = getBadge()

  return (
    <>
      <Button
        variant="tertiaryText"
        size="sm"
        square
        tooltip={badge.tooltip}
        aria-label={badge.tooltip}
        onPress={() => setIsDialogOpen(true)}
        className={css({
          padding: '0.15rem !important',
          minWidth: 'auto !important',
          width: '1.5rem !important',
          height: '1.5rem !important',
          borderRadius: '50% !important',
          backgroundColor: `${badge.bg} !important`,
          flexShrink: 0,
        })}
      >
        {badge.icon}
      </Button>
      <FingerprintDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        participantName={participant.username}
        participantEmail={participant.email}
        suiteUserId={participant.suite_user_id}
        isAuthenticated={participant.is_authenticated}
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
  const encryptedRoom = isEncryptedRoom(roomData)

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
        {encryptedRoom && (
          <EncryptionTrustIndicator participant={participant} />
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
          {encryptedRoom && participant.email && (
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
