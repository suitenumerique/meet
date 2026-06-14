import { Div } from '@/primitives'
import { ToastProvider } from './components/ToastProvider'
import { WaitingParticipantNotification } from './components/WaitingParticipantNotification'

export const NotificationProvider = ({
  bottom = 0,
  right = 5,
}: {
  bottom?: number
  right?: number
}) => (
  <Div position="absolute" bottom={bottom} right={right} zIndex={1000}>
    <ToastProvider />
    <WaitingParticipantNotification />
  </Div>
)
