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
import { breakoutStore, resetBreakout } from '../store'
import {
  buildRooms,
  isAssignable,
  isHost,
  shuffleAssignments,
} from '../utils/setup'
import { ErrorNote } from './ErrorNote'
import { RoomCountField } from './RoomCountField'
import { useOpenShortcut } from '../hooks/useOpenShortcut'
import { getParticipantName } from '@/features/rooms/utils/getParticipantName'
import { useRoomMetadata } from '@/features/recording/hooks/useRoomMetadata'
import { RecordingStatus } from '@/features/recording/hooks/useRecordingStatuses'

const UNASSIGNED = -1

export const BreakoutSetup = ({ roomId }: { roomId: string }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'breakout' })
  // In the store, so switching panels keeps the plan.
  const { roomCount, assignments } = useSnapshot(breakoutStore)

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
      name: p.isLocal
        ? t('setup.you', { name: getParticipantName(p) })
        : getParticipantName(p),
      isHost: isHost(p),
    }))
  // Whoever is not in a browser cannot be placed and stays in the main room.
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
  // The backend refuses to open while a recording starts or runs.
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
      }),
    onSuccess: (session) => {
      queryClient.setQueryData(breakoutSessionKey(roomId), session)
      resetBreakout()
    },
    // A failed open leaves the metadata as it was, so nothing else refetches.
    onError: () =>
      queryClient.invalidateQueries({ queryKey: breakoutSessionKey(roomId) }),
  })

  const canOpen = !open.isPending && !isRecording && placed
  useOpenShortcut(() => open.mutate(), canOpen)

  return (
    <>
      <RoomCountField
        value={roomCount}
        onChange={(count) => (breakoutStore.roomCount = count)}
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
          onPress={() =>
            // Hosts keep whatever room they were given by hand.
            (breakoutStore.assignments = {
              ...Object.fromEntries(
                people
                  .filter((p) => p.isHost && p.identity in assignments)
                  .map((p) => [p.identity, assignments[p.identity]])
              ),
              ...shuffleAssignments(
                people.filter((p) => !p.isHost).map((p) => p.identity),
                roomCount
              ),
            })
          }
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
              {p.name}
            </Text>
            <div className={css({ width: '10rem', flexShrink: 0 })}>
              <Select
                aria-label={t('setup.assign', { name: p.name })}
                label=""
                items={roomItems}
                selectedKey={roomOf(p.identity)}
                onSelectionChange={(key) =>
                  (breakoutStore.assignments[p.identity] = Number(key))
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
      {open.isError && !isRecording && <ErrorNote />}
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
