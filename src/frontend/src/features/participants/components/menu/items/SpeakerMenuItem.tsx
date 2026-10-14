import React, { useCallback } from 'react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import type { Participant } from 'livekit-client'
import { RiMicOffLine, RiUserVoiceLine } from '@remixicon/react'
import { useParticipantSpeaker } from '@/features/participants/api/updateParticipantSpeaker'
import { useRoomPublishSources } from '@/features/rooms/livekit/hooks/useRoomPublishSources'
import { menuRecipe } from '@/primitives/menuRecipe'
import { HStack } from '@/styled-system/jsx'

type SpeakerMenuItemProps = {
  participant: Participant
  isSpeaker: boolean
}

export const SpeakerMenuItem = React.memo(
  ({ participant, isSpeaker }: SpeakerMenuItemProps) => {
    const { t } = useTranslation('rooms', { keyPrefix: 'participantMenu' })
    const { makeSpeaker, removeSpeaker } = useParticipantSpeaker()
    const roomSources = useRoomPublishSources()

    const label = isSpeaker ? 'removeSpeaker' : 'makeSpeaker'
    const Icon = isSpeaker ? RiMicOffLine : RiUserVoiceLine

    const toggleSpeaker = useCallback(
      () =>
        isSpeaker
          ? removeSpeaker(participant, roomSources)
          : makeSpeaker(participant),
      [isSpeaker, participant, roomSources, makeSpeaker, removeSpeaker]
    )

    return (
      <MenuItem
        aria-label={t(`${label}.ariaLabel`, {
          name: participant.name || participant.identity,
        })}
        className={menuRecipe({ icon: true }).item}
        onAction={toggleSpeaker}
      >
        <HStack gap={0.25} minWidth={280}>
          <Icon size={20} aria-hidden />
          {t(`${label}.label`)}
        </HStack>
      </MenuItem>
    )
  }
)

SpeakerMenuItem.displayName = 'SpeakerMenuItem'
