import { Participant, Track } from 'livekit-client'
import { useTranslation } from 'react-i18next'
import { useTrackMutedIndicator } from '@livekit/components-react'
import { useMuteParticipant } from '@/features/rooms/api/muteParticipant'
import { useState } from 'react'
import { Button } from '@/primitives'
import { RiMicLine, RiMicOffLine } from '@remixicon/react'
import { MuteAlertDialog } from '@/features/rooms/livekit/components/MuteAlertDialog'

export const MuteButton = ({ participant }: { participant: Participant }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participantTileFocus' })

  const { isMuted } = useTrackMutedIndicator({
    participant: participant,
    source: Track.Source.Microphone,
  })

  const { muteParticipant } = useMuteParticipant()
  const [isAlertOpen, setIsAlertOpen] = useState(false)

  const name = participant.name || participant.identity

  return (
    <>
      <Button
        isDisabled={isMuted}
        size={'sm'}
        variant={'primaryTextDark'}
        square
        onPress={() => setIsAlertOpen(true)}
        tooltip={t('muteParticipant', { name })}
      >
        {!isMuted ? <RiMicLine /> : <RiMicOffLine />}
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
