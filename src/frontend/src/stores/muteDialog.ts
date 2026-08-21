import { proxy, ref } from 'valtio'
import type { Participant } from 'livekit-client'

type State = {
  participant: Participant | null
}

export const muteDialogStore = proxy<State>({
  participant: null,
})

export const openMuteDialog = (participant: Participant) => {
  muteDialogStore.participant = ref(participant)
}

export const closeMuteDialog = () => {
  muteDialogStore.participant = null
}
