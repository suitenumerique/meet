import { css } from '@/styled-system/css'

import { HStack, VStack } from '@/styled-system/jsx'
import { Text } from '@/primitives/Text'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/Avatar'
import { getParticipantColor } from '@/features/rooms/utils/getParticipantColor'
import { getParticipantIsRoomAdmin } from '@/features/rooms/utils/getParticipantIsRoomAdmin'
import { Participant, Track } from 'livekit-client'
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
        isDisabled={isMuted}
        onPress={() =>
          !isMuted && isLocal(participant)
            ? muteParticipant(participant)
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
  const name = participant.name || participant.identity
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
        <Avatar name={name} bgColor={getParticipantColor(participant)} />
        <VStack gap={0} alignItems="start">
          <Text
            sm
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
          {getParticipantIsRoomAdmin(participant) && (
            <Text variant="xsNote">{t('participants.host')}</Text>
          )}
        </VStack>
      </HStack>
      <HStack>
        <MicIndicator participant={participant} />
      </HStack>
    </HStack>
  )
}
