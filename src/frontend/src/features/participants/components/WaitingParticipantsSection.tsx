import { useTranslation } from 'react-i18next'
import { ParticipantsCollapsibleSection } from './ParticipantsCollapsibleSection'
import { WaitingParticipantRow } from './WaitingParticipantRow'
import { useWaitingParticipants } from '../hooks/useWaitingParticipants'

export const WaitingParticipantsSection = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participants.waiting' })

  const { waitingParticipants, handleParticipantEntry } =
    useWaitingParticipants()

  if (waitingParticipants?.length == 0) return

  return (
    <ParticipantsCollapsibleSection
      heading={t('title')}
      count={waitingParticipants.length}
    >
      {waitingParticipants.map((p) => (
        <WaitingParticipantRow
          key={p.id}
          participant={p}
          onAction={handleParticipantEntry}
        />
      ))}
    </ParticipantsCollapsibleSection>
  )
}
