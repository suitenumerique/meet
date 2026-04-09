import { proxy } from 'valtio'

export type CandidateInfo = {
  type: string
  address: string
  protocol: string
}

type State = {
  isIdleDisconnectModalOpen: boolean
  publisher: CandidateInfo | null
  publisherChangesCount: number
  subscriber: CandidateInfo | null
  subscriberChangesCount: number
}

export const connectionObserverStore = proxy<State>({
  isIdleDisconnectModalOpen: false,
  publisher: null,
  publisherChangesCount: 0,
  subscriber: null,
  subscriberChangesCount: 0,
})
