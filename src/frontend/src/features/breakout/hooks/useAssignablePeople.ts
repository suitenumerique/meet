import {
  useLocalParticipant,
  useRemoteParticipants,
} from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { useTranslation } from 'react-i18next'
import { getParticipantName } from '@/features/rooms/utils/getParticipantName'
import { getParticipantIsRoomAdminOrOwner } from '@/features/rooms/utils/getParticipantIsRoomAdminOrOwner'
import { isAssignable } from '../utils/setup'

// Who the host can send to a room, this browser included, and whether anyone
// here cannot be placed. Joins and leaves always update; a name or a role is
// all else the list reads.
export const useAssignablePeople = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'breakout' })
  const { localParticipant } = useLocalParticipant()
  const remotes = useRemoteParticipants({
    updateOnlyOn: [
      RoomEvent.ParticipantNameChanged,
      RoomEvent.ParticipantAttributesChanged,
    ],
  })
  const people = [localParticipant, ...remotes]
    .filter(isAssignable)
    .map((p) => ({
      identity: p.identity,
      // "(you)" is shown here alone, never sent.
      name: getParticipantName(p),
      label: p.isLocal
        ? t('setup.you', { name: getParticipantName(p) })
        : getParticipantName(p),
      isHost: getParticipantIsRoomAdminOrOwner(p),
    }))
  // Whoever is not in a browser cannot be placed in a room.
  const hasNonBrowsers = remotes.some((p) => !isAssignable(p))
  return { people, hasNonBrowsers }
}
