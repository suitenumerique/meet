import { proxy } from 'valtio'
import type { Reaction } from '@/features/reactions/types'

type State = {
  reactions: Reaction[]
}

export const reactionsStore = proxy<State>({
  reactions: [],
})
