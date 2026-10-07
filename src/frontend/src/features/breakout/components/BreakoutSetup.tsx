import { useMutation } from '@tanstack/react-query'
import {
  useLocalParticipant,
  useRemoteParticipants,
} from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { RiShuffleLine } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { Button, Text } from '@/primitives'
import { Select } from '@/primitives/Select'
import { queryClient } from '@/api/queryClient'
import { breakoutSessionKey, createBreakoutSession } from '../api'
import { breakoutSetupStore, resetBreakoutSetup } from '../store'
import { buildRooms, isAssignable, shuffleAssignments } from '../utils/setup'
import { MAIN_ROOM } from '../utils/split'
import { getParticipantIsRoomAdminOrOwner } from '@/features/rooms/utils/getParticipantIsRoomAdminOrOwner'
import { ErrorNote } from './ErrorNote'
import { RoomCountField } from './RoomCountField'
import { useOpenShortcut } from '../hooks/useOpenShortcut'
import { getParticipantName } from '@/features/rooms/utils/getParticipantName'
import { useRoomMetadata } from '@/features/recording/hooks/useRoomMetadata'
import { RecordingStatus } from '@/features/recording/hooks/useRecordingStatuses'

// Someone left unassigned stays in the main room.
const UNASSIGNED = MAIN_ROOM

export const BreakoutSetup = ({ roomId }: { roomId: string }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'breakout' })
  // In the store, so switching panels keeps the plan.
  const { roomCount, assignments } = useSnapshot(breakoutSetupStore)

  // Joins and leaves always update; a name or a role is all else the list reads.
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
      name: getParticipantName(p),
      isHost: getParticipantIsRoomAdminOrOwner(p),
    }))
  // The stored name stays the participant's own; "(you)" is shown here alone.
  const labelOf = (p: (typeof people)[number]) =>
    p.identity === localParticipant.identity
      ? t('setup.you', { name: p.name })
      : p.name
  // Whoever is not in a browser cannot be placed in a room.
  const hasNonBrowsers = remotes.some((p) => !isAssignable(p))
  // A room removed by lowering the room count leaves its people unassigned.
  const roomOf = (identity: string) => {
    const index = assignments[identity] ?? UNASSIGNED
    return index >= 0 && index < roomCount ? index : UNASSIGNED
  }
  // A host left unplaced stays in the main room, as hosts do by default.
  const guests = people.filter((p) => !p.isHost)
  const placed = people.some((p) => roomOf(p.identity) !== UNASSIGNED)
  const unassigned = guests.filter(
    (p) => roomOf(p.identity) === UNASSIGNED
  ).length
  let assignmentStatus = t('setup.allAssigned')
  if (guests.length === 0) assignmentStatus = t('setup.nobody')
  else if (unassigned > 0)
    assignmentStatus = t('setup.unassigned', { count: unassigned })
  const roomNames = Array.from({ length: roomCount }, (_, i) =>
    t('roomName', { number: i + 1 })
  )
  // A recording would hear every room, so Open stops it, and says so first.
  const isRecording = [
    RecordingStatus.Starting,
    RecordingStatus.Started,
  ].includes(useRoomMetadata()?.recording_status)
  const roomItems = [
    { value: UNASSIGNED, label: t('setup.unassignedOption') },
    ...roomNames.map((label, value) => ({ value, label })),
  ]

  const open = useMutation({
    mutationFn: () =>
      createBreakoutSession(roomId, {
        rooms: buildRooms(roomNames, people, assignments),
        stop_recording: isRecording,
      }),
    onSuccess: (session) => {
      queryClient.setQueryData(breakoutSessionKey(roomId), session)
      resetBreakoutSetup()
    },
    // A failed open leaves the metadata as it was, so nothing else refetches.
    onError: () =>
      queryClient.invalidateQueries({ queryKey: breakoutSessionKey(roomId) }),
  })

  const canOpen = !open.isPending && placed
  useOpenShortcut(() => open.mutate(), canOpen)

  // Deals the guests across the rooms at random. Hosts keep whatever room
  // they were given by hand, and stay in the main room otherwise.
  const shuffle = () => {
    const hostPlaces = Object.fromEntries(
      people
        .filter((p) => p.isHost && p.identity in assignments)
        .map((p) => [p.identity, assignments[p.identity]])
    )
    const guestPlaces = shuffleAssignments(
      guests.map((p) => p.identity),
      roomCount
    )
    breakoutSetupStore.assignments = { ...hostPlaces, ...guestPlaces }
  }

  return (
    <>
      <RoomCountField
        value={roomCount}
        onChange={(count) => (breakoutSetupStore.roomCount = count)}
      />
      <div
        className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        })}
      >
        <Text variant="bodyXsBold">{assignmentStatus}</Text>
        <Button
          variant="secondaryText"
          size="sm"
          isDisabled={guests.length === 0}
          onPress={shuffle}
        >
          <RiShuffleLine size={16} aria-hidden />
          {t('setup.shuffle')}
        </Button>
      </div>
      <ul
        className={css({
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        })}
      >
        {people.map((p) => (
          <li
            key={p.identity}
            className={css({
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
            })}
          >
            <Text variant="sm" wrap="pretty">
              {labelOf(p)}
            </Text>
            <div className={css({ width: '10rem', flexShrink: 0 })}>
              <Select
                aria-label={t('setup.assign', { name: labelOf(p) })}
                label=""
                items={roomItems}
                selectedKey={roomOf(p.identity)}
                onSelectionChange={(key) =>
                  (breakoutSetupStore.assignments[p.identity] = Number(key))
                }
              />
            </div>
          </li>
        ))}
      </ul>
      {hasNonBrowsers && (
        <Text variant="warning">{t('setup.notInBrowser')}</Text>
      )}
      {isRecording && <Text variant="warning">{t('setup.recording')}</Text>}
      {open.isError && <ErrorNote />}
      <Button
        variant="primary"
        fullWidth
        isDisabled={!canOpen}
        onPress={() => open.mutate()}
      >
        {t('setup.open')}
      </Button>
    </>
  )
}
