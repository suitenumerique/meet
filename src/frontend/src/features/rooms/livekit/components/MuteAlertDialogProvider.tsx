import { useRef } from 'react'
import { useSnapshot } from 'valtio'
import { useMuteParticipant } from '@/features/rooms/api/muteParticipant'
import { closeMuteDialog, muteDialogStore } from '@/stores/muteDialog'
import { MuteAlertDialog } from './MuteAlertDialog'

export const MuteAlertDialogProvider = () => {
  const { participant } = useSnapshot(muteDialogStore)
  const { muteParticipant } = useMuteParticipant()

  const lastNameRef = useRef('')
  if (participant) {
    lastNameRef.current = participant.name || participant.identity
  }

  return (
    <MuteAlertDialog
      isOpen={!!participant}
      name={lastNameRef.current}
      onClose={closeMuteDialog}
      onSubmit={() => {
        const target = muteDialogStore.participant
        if (!target) return
        muteParticipant(target).then(closeMuteDialog)
      }}
    />
  )
}
