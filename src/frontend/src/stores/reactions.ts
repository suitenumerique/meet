import { proxy } from 'valtio'

export enum Emoji {
  THUMBS_UP = 'thumbs-up',
  THUMBS_DOWN = 'thumbs-down',
  CLAP = 'clapping-hands',
  HEART = 'red-heart',
  LAUGHING = 'face-with-tears-of-joy',
  SURPRISED = 'face-with-open-mouth',
  CELEBRATION = 'party-popper',
  PLEASE = 'folded-hands',
}

export interface Reaction {
  id: string
  emoji: Emoji
  participantName: string
  isLocal: boolean
}

type State = {
  reactions: Reaction[]
}

export const reactionsStore = proxy<State>({
  reactions: [],
})
