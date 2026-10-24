import { proxy } from 'valtio'

type State = {
  participantIds: Record<string, string | undefined>
}

export const layoutStore = proxy<State>({
  participantIds: {},
})

export const setLobbyParticipantId = (
  roomId: string,
  participantId: string
) => {
  layoutStore.participantIds[roomId] = participantId
}

export const clearParticipantId = (roomId: string) => {
  delete layoutStore.participantIds[roomId]
}

export const getLobbyParticipantId = (roomId: string) =>
  layoutStore.participantIds[roomId]
