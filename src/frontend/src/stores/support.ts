import { proxy } from 'valtio'

export type SupportWidgetStatus = 'closed' | 'pending' | 'open'

type State = {
  status: SupportWidgetStatus
  showSentConfirmation: boolean
}

export const supportStore = proxy<State>({
  status: 'closed',
  showSentConfirmation: false,
})
