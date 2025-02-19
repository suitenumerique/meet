import { css } from '@/styled-system/css'
import { useParticipants } from '@livekit/components-react'

import { Button, Div, H } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { ParticipantListItem } from '../../controls/Participants/ParticipantListItem'
import { ParticipantsCollapsableList } from '../../controls/Participants/ParticipantsCollapsableList'
import { HandRaisedListItem } from '../../controls/Participants/HandRaisedListItem'
import { LowerAllHandsButton } from '../../controls/Participants/LowerAllHandsButton'
import { HStack } from '@/styled-system/jsx'
import { WaitingParticipantListItem } from './WaitingParticipantListItem'
import { useWaitingParticipants } from '@/features/rooms/hooks/useWaitingParticipants'
import { Participant } from 'livekit-client'
import { WaitingParticipant } from '@/features/rooms/api/listWaitingParticipants'

// TODO: Optimize rendering performance, especially for longer participant lists, even though they are generally short.
export const ParticipantsList = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participants' })

  // Preferred using the 'useParticipants' hook rather than the separate remote and local hooks,
  // because the 'useLocalParticipant' hook does not update the participant's information when their
  // metadata/name changes. The LiveKit team has marked this as a TODO item in the code.
  const participants = useParticipants()

  const sortedRemoteParticipants = participants
    .slice(1)
    .sort((participantA, participantB) => {
      const nameA = participantA.name || participantA.identity
      const nameB = participantB.name || participantB.identity
      return nameA.localeCompare(nameB)
    })

  const sortedParticipants = [
    participants[0], // first participant returned by the hook, is always the local one
    ...sortedRemoteParticipants,
  ]

  const raisedHandParticipants = participants.filter((participant) => {
    const data = JSON.parse(participant.metadata || '{}')
    return data.raised
  })

  const {
    waitingParticipants,
    handleParticipantEntry,
    handleParticipantsEntry,
  } = useWaitingParticipants()

  // TODO - extract inline styling in a centralized styling file, and avoid magic numbers
  return (
    <Div overflowY="scroll">
      <H
        lvl={2}
        className={css({
          fontSize: '0.875rem',
          fontWeight: 'bold',
          color: '#5f6368',
          padding: '0 1.5rem',
          marginBottom: '0.83em',
        })}
      >
        {t('subheading').toUpperCase()}
      </H>
      {waitingParticipants?.length > 0 && (
        <Div marginBottom=".9375rem">
          <ParticipantsCollapsableList<WaitingParticipant>
            heading={t('waiting.title')}
            participants={waitingParticipants}
            renderParticipant={(participant) => (
              <WaitingParticipantListItem
                key={participant.id}
                participant={participant}
                onAction={handleParticipantEntry}
              />
            )}
            action={() => (
              <HStack justify={'center'} width={'100%'}>
                <Button
                  size="sm"
                  variant="secondaryText"
                  onPress={() => handleParticipantsEntry(false)}
                >
                  {t('waiting.deny.all')}
                </Button>
                <Button
                  size="sm"
                  variant="secondaryText"
                  onPress={() => handleParticipantsEntry(true)}
                >
                  {t('waiting.accept.all')}
                </Button>
              </HStack>
            )}
          />
        </Div>
      )}
      {raisedHandParticipants.length > 0 && (
        <Div marginBottom=".9375rem">
          <ParticipantsCollapsableList<Participant>
            heading={t('raisedHands')}
            participants={raisedHandParticipants}
            renderParticipant={(participant) => (
              <HandRaisedListItem
                key={participant.identity}
                participant={participant}
              />
            )}
            action={() => (
              <LowerAllHandsButton participants={raisedHandParticipants} />
            )}
          />
        </Div>
      )}
      <ParticipantsCollapsableList<Participant>
        heading={t('contributors')}
        participants={sortedParticipants}
        renderParticipant={(participant) => (
          <ParticipantListItem
            key={participant.identity}
            participant={participant}
          />
        )}
      />
    </Div>
  )
}
