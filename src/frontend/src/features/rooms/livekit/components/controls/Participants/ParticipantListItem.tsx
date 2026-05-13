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
import { RiErrorWarningLine, RiMicFill, RiMicOffFill } from '@remixicon/react'
import { Button } from '@/primitives'
import { useState } from 'react'
import { MuteAlertDialog } from '../../MuteAlertDialog'
import { useMuteParticipant } from '@/features/rooms/api/muteParticipant'
import { useCanMute } from '@/features/rooms/livekit/hooks/useCanMute'
import { ParticipantMenuButton } from '../../ParticipantMenu/ParticipantMenuButton'
import { PinBadge } from './PinBadge'
import { VisualOnlyTooltip } from '@/primitives/VisualOnlyTooltip'
import { useUser } from '@/features/auth'

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
  const { isLoggedIn } = useUser()
  const name = participant.name || participant.identity
  const isParticipantAuthenticated =
    participant.attributes?.is_authenticated === 'true'
  const anonymousLabel = t('identity.anonymous.tooltip')
  // Email is only displayed to authenticated viewers (defense-in-depth on
  // top of the JWT-level guarantee that it's only emitted for authenticated
  // participants). The LK signaling channel broadcasts attributes to every
  // peer, so the UI is what protects anonymous viewers from seeing it.
  const email = isLoggedIn ? participant.attributes?.email : undefined
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
          <HStack gap="0.2rem" alignItems="center">
            <Text
              variant="sm"
              margin={false}
              className={css({
                userSelect: 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '150px',
                lineHeight: 1.2,
              })}
            >
              {name}
              {isLocal(participant) && ` (${t('participants.you')})`}
            </Text>
            {!isParticipantAuthenticated && (
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
          {getParticipantIsRoomAdmin(participant) && (
            <Text variant="xsNote">{t('participants.host')}</Text>
          )}
          {email && (
            <Text
              variant="xsNote"
              className={css({
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '180px',
              })}
            >
              {email}
            </Text>
          )}
        </VStack>
      </HStack>
      <HStack>
        <MicIndicator participant={participant} />
        <ParticipantMenuButton participant={participant} />
      </HStack>
    </HStack>
  )
}
