import { proxy } from 'valtio'
import { Reaction } from '@/features/reactions/types'

type State = {
  reactions: Reaction[]
}

export const reactionsStore = proxy<State>({
  reactions: [],
})
