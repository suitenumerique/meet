import { css } from '@/styled-system/css'
import { useParticipants } from '@livekit/components-react'

import { Div, H } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { ParticipantListItem } from '../../controls/Participants/ParticipantListItem'
import { ParticipantsCollapsableList } from '../../controls/Participants/ParticipantsCollapsableList'
import { HandRaisedListItem } from '../../controls/Participants/HandRaisedListItem'
import { LowerAllHandsButton } from '../../controls/Participants/LowerAllHandsButton'
import { WaitingParticipantListItem } from './WaitingParticipantListItem'
import { useWaitingParticipants } from '@/features/rooms/hooks/useWaitingParticipants'
import { Participant } from 'livekit-client'
import { WaitingParticipant } from '@/features/rooms/api/listWaitingParticipants'
import { MuteEveryoneButton } from './MuteEveryoneButton'
import { useSidePanel } from '../../../hooks/useSidePanel'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'
import { useSidePanelRef } from '../../../hooks/useSidePanelRef'
import { useSidePanelTriggers } from '../../../hooks/useSidePanelTriggers'

// TODO: Optimize rendering performance, especially for longer participant lists, even though they are generally short.
export const ParticipantsList = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participants' })
  const { isParticipantsOpen } = useSidePanel()
  const panelRef = useSidePanelRef()
  const { getTrigger } = useSidePanelTriggers()

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

  const raisedHandParticipants = participants
    .filter((participant) => !!participant.attributes.handRaisedAt)
    .sort((a, b) => {
      const dateA = new Date(a.attributes.handRaisedAt)
      const dateB = new Date(b.attributes.handRaisedAt)
      const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime()
      const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime()
      return timeA - timeB
    })

  const { waitingParticipants, handleParticipantEntry } =
    useWaitingParticipants()

  // Restore focus to the element that opened the Participants panel
  useRestoreFocus(isParticipantsOpen, {
    resolveTrigger: (activeEl) => {
      return getTrigger('participants') ?? activeEl
    },
    // Focus the first focusable element when the panel opens
    onOpened: () => {
      // Use setTimeout + RAF to ensure DOM is fully rendered and transition completed
      setTimeout(() => {
        requestAnimationFrame(() => {
          const panel = panelRef.current
          if (panel) {
            // Find the first ToggleHeader (collapsable list header) in the participants panel
            const firstListHeader = panel.querySelector<HTMLElement>(
              'button[data-focus-target="list-header"]'
            )
            firstListHeader?.focus({ preventScroll: true })
          }
        })
      }, 100) // Wait for panel slide-in animation to complete
    },
    restoreFocusRaf: true,
    preventScroll: true,
  })

  // TODO - extract inline styling in a centralized styling file, and avoid magic numbers
  return (
    <Div overflowY="scroll">
      <H
        lvl={2}
        className={css({
          fontSize: '0.875rem',
          fontWeight: 'bold',
          color: 'greyscale.600',
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
            action={<></>}
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
            action={
              <LowerAllHandsButton participants={raisedHandParticipants} />
            }
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
        action={<MuteEveryoneButton participants={sortedRemoteParticipants} />}
      />
    </Div>
  )
}
