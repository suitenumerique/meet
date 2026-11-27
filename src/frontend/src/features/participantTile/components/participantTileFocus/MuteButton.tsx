import { Participant, Track } from 'livekit-client'
import { useTranslation } from 'react-i18next'
import { useTrackMutedIndicator } from '@livekit/components-react'
import { Button, Icon } from '@/primitives'
import { openMuteDialog } from '@/stores/muteDialog'

export const MuteButton = ({ participant }: { participant: Participant }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participantTileFocus' })

  const { isMuted } = useTrackMutedIndicator({
    participant: participant,
    source: Track.Source.Microphone,
  })

  const name = participant.name || participant.identity

  return (
    <Button
      isDisabled={isMuted}
      size={'sm'}
      variant={'primaryTextDark'}
      square
      onPress={() => openMuteDialog(participant)}
      tooltip={t('muteParticipant', { name })}
    >
      {!isMuted ? <Icon name="mic" /> : <Icon name="mic-off" />}
    </Button>
  )
}
