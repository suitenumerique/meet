import { css } from '@/styled-system/css'
import {
  useRemoteParticipants,
  useRoomContext,
} from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { Div, H } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { ParticipantRow } from './ParticipantRow'
import { ParticipantsCollapsibleSection } from './ParticipantsCollapsibleSection'
import { LowerAllHandsButton } from './LowerAllHandsButton'
import { MuteEveryoneButton } from './MuteEveryoneButton'
import { WaitingParticipantsSection } from './WaitingParticipantsSection'
import { RaisedHandRow } from './RaisedHandRow'

const JoinedParticipantsSections = () => {
  const room = useRoomContext()
  const { t } = useTranslation('rooms', { keyPrefix: 'participants' })

  // `updateOnlyOn` filters on the room event *type*, not on which participant
  // the event is about. `ParticipantNameChanged` and `ParticipantAttributesChanged`
  // are room-wide and fire for the local participant too, so this hook re-emits
  // (and we re-render) on local changes, despite its name.
  //
  // That is deliberate here: we prepend `room.localParticipant` to the list below,
  // and its hand-raise state comes from `attributes.handRaisedAt`. Without the
  // local events waking this component up, raising your own hand would not
  // update the UI. Do not "optimise" these away.
  const remoteParticipants = useRemoteParticipants({
    updateOnlyOn: [
      RoomEvent.ParticipantNameChanged,
      RoomEvent.ParticipantAttributesChanged,
    ],
  })

  const allParticipants = [
    room.localParticipant,
    ...[...remoteParticipants].sort((a, b) =>
      (a.name || a.identity).localeCompare(b.name || b.identity)
    ),
  ]

  const participantsWithRaisedHands = allParticipants
    .filter((p) => !!p.attributes.handRaisedAt)
    .sort((a, b) => {
      const raisedAtA = Date.parse(a.attributes.handRaisedAt!)
      const raisedAtB = Date.parse(b.attributes.handRaisedAt!)
      return (
        (Number.isNaN(raisedAtA) ? Infinity : raisedAtA) -
        (Number.isNaN(raisedAtB) ? Infinity : raisedAtB)
      )
    })

  return (
    <>
      {participantsWithRaisedHands.length > 0 && (
        <ParticipantsCollapsibleSection
          heading={t('raisedHands')}
          count={participantsWithRaisedHands.length}
          action={
            <LowerAllHandsButton participants={participantsWithRaisedHands} />
          }
        >
          {participantsWithRaisedHands.map((p) => (
            <RaisedHandRow key={p.identity} participant={p} />
          ))}
        </ParticipantsCollapsibleSection>
      )}
      <ParticipantsCollapsibleSection
        heading={t('contributors')}
        count={allParticipants.length}
        action={<MuteEveryoneButton participants={remoteParticipants} />}
      >
        {allParticipants.map((p) => (
          <ParticipantRow key={p.identity} participant={p} />
        ))}
      </ParticipantsCollapsibleSection>
    </>
  )
}

export const ParticipantsList = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participants' })

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
      <WaitingParticipantsSection />
      <JoinedParticipantsSections />
    </Div>
  )
}
