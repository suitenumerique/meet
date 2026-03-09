import { proxy } from 'valtio'
import { Reaction } from '@/features/rooms/livekit/components/controls/ReactionsToggle.tsx'

type State = {
  reactions: Reaction[]
}

export const reactionsStore = proxy<State>({
  reactions: [],
})
