import { css } from '@/styled-system/css'

import { HStack, VStack } from '@/styled-system/jsx'
import { Text } from '@/primitives/Text'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/Avatar'
import { getParticipantColor } from '@/features/rooms/utils/getParticipantColor'
import { getParticipantIsRoomAdmin } from '@/features/rooms/utils/getParticipantIsRoomAdmin'
import { LocalParticipant, Participant, Track } from 'livekit-client'
import { isLocal } from '@/utils/livekit'
import {
  useIsSpeaking,
  useTrackMutedIndicator,
} from '@livekit/components-react'
import Source = Track.Source
import { RiMicFill, RiMicOffFill } from '@remixicon/react'
import { Button } from '@/primitives'
import { useState } from 'react'
import { MuteAlertDialog } from '../../MuteAlertDialog'
import { useMuteParticipant } from '@/features/rooms/api/muteParticipant'
import { useCanMute } from '@/features/rooms/livekit/hooks/useCanMute'
import { ParticipantMenuButton } from '../../ParticipantMenu/ParticipantMenuButton'
import { PinBadge } from './PinBadge'
import { EncryptionBadge, getTrustLevelFromAttributes, FingerprintDialog } from '@/features/encryption'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { isEncryptedRoom as isEncryptedRoomFn } from '@/features/rooms/api/ApiRoom'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { useUser } from '@/features/auth'
import { TooltipWrapper } from '@/primitives/TooltipWrapper'

type MicIndicatorProps = {
  participant: Participant
}

const MicIndicator = ({ participant }: MicIndicatorProps) => {
  const { t } = useTranslation('rooms')
  const { muteParticipant } = useMuteParticipant()
  const { isMuted } = useTrackMutedIndicator({
    participant: participant,
    source: Source.Microphone,
  })

  const canMute = useCanMute(participant)
  const isSpeaking = useIsSpeaking(participant)
  const [isAlertOpen, setIsAlertOpen] = useState(false)
  const name = participant.name || participant.identity

  const label = isLocal(participant)
    ? t('participants.muteYourself')
    : t('participants.muteParticipant', {
        name,
      })

  return (
    <>
      <Button
        square
        variant="greyscale"
        size="sm"
        tooltip={label}
        aria-label={label}
        isDisabled={isMuted || !canMute}
        onPress={async () =>
          !isMuted && isLocal(participant)
            ? await (participant as LocalParticipant)?.setMicrophoneEnabled(
                false
              )
            : setIsAlertOpen(true)
        }
        data-attr="participants-mute"
      >
        {isMuted ? (
          <RiMicOffFill color={'gray'} aria-hidden={true} />
        ) : (
          <RiMicFill
            className={css({
              color: isSpeaking ? 'primaryDark.300' : 'primaryDark.50',
              animation: isSpeaking
                ? 'pulse_background 800ms infinite'
                : undefined,
            })}
            aria-hidden={true}
          />
        )}
      </Button>
      <MuteAlertDialog
        isOpen={isAlertOpen}
        onSubmit={() =>
          muteParticipant(participant).then(() => setIsAlertOpen(false))
        }
        onClose={() => setIsAlertOpen(false)}
        name={name}
      />
    </>
  )
}

type ParticipantListItemProps = {
  participant: Participant
}

export const ParticipantListItem = ({
  participant,
}: ParticipantListItemProps) => {
  const { t } = useTranslation('rooms')
  const roomData = useRoomData()
  const isEncryptedRoom = isEncryptedRoomFn(roomData)
  const isAdmin = useIsAdminOrOwner()
  const { isLoggedIn } = useUser()
  const { t: tEncBadge } = useTranslation('rooms', { keyPrefix: 'encryption.badge' })
  const [isFingerprintOpen, setIsFingerprintOpen] = useState(false)
  const name = participant.name || participant.identity
  const attrs = participant.attributes as Record<string, string> | undefined
  const trustLevel = getTrustLevelFromAttributes(attrs, roomData?.encryption_mode)
  const badgeTooltip = trustLevel ? tEncBadge(trustLevel) : undefined
  return (
    <HStack
      role="listitem"
      justify="space-between"
      id={participant.identity}
      className={css({
        padding: '0.25rem 0',
        width: 'full',
      })}
    >
      <HStack>
        <div
          className={css({
            position: 'relative',
          })}
        >
          <Avatar name={name} bgColor={getParticipantColor(participant)} />
          <PinBadge participant={participant} />
        </div>
        <VStack gap={0} alignItems="start">
          {isEncryptedRoom ? (
            <Button
              variant="greyscale"
              size="sm"
              tooltip={badgeTooltip}
              aria-label={badgeTooltip}
              onPress={isAdmin ? () => setIsFingerprintOpen(true) : undefined}
              className={css({
                padding: '0.1rem 0.25rem !important',
                minWidth: 'auto !important',
                height: 'auto !important',
                gap: '0.15rem !important',
                borderRadius: '0.25rem !important',
                backgroundColor: 'transparent !important',
                color: 'greyscale.900 !important',
                cursor: isAdmin ? 'pointer' : 'default',
                '&[data-hovered]': {
                  backgroundColor: isAdmin ? 'greyscale.100 !important' : 'transparent !important',
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
                  maxWidth: '120px',
                })}
              >
                {name}
              </Text>
              {isLocal(participant) && (
                <Text
                  variant="sm"
                  className={css({ whiteSpace: 'nowrap', flexShrink: 0 })}
                >
                  ({t('participants.you')})
                </Text>
              )}
            </Button>
          ) : (
            <Text
              variant="sm"
              className={css({
                userSelect: 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '150px',
              })}
            >
              {name}
              {isLocal(participant) && ` (${t('participants.you')})`}
            </Text>
          )}
          {getParticipantIsRoomAdmin(participant) && (
            <Text variant="xsNote">{t('participants.host')}</Text>
          )}
          {/* Email is only in JWT for encrypted rooms (backend restriction).
              Additionally, only show to authenticated users in the UI — anonymous
              users in encrypted rooms could still extract it from LiveKit signaling
              but won't see it in the interface. See utils.py for details. */}
          {isEncryptedRoom && isLoggedIn && (() => {
            const email = participant.attributes?.is_authenticated === 'true' && participant.attributes?.email
              ? participant.attributes.email
              : null
            const label = email || t('participants.anonymous')
            return (
              <Button
                variant="greyscale"
                size="sm"
                tooltip={email || undefined}
                aria-label={label}
                className={css({
                  padding: '0 !important',
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
      <HStack>
        <MicIndicator participant={participant} />
        <ParticipantMenuButton participant={participant} />
      </HStack>
      {isEncryptedRoom && isAdmin && (
        <FingerprintDialog
          isOpen={isFingerprintOpen}
          onOpenChange={setIsFingerprintOpen}
          participantName={name}
          participantEmail={attrs?.email}
          suiteUserId={attrs?.suite_user_id}
          isAuthenticated={attrs?.is_authenticated === 'true'}
          encryptionMode={roomData?.encryption_mode}
        />
      )}
    </HStack>
  )
}
