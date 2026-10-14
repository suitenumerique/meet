import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { RiShuffleLine } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { Button, Text } from '@/primitives'
import { queryClient } from '@/api/queryClient'
import { breakoutSessionKey, createBreakoutSession } from '../api'
import { breakoutSetupStore, resetBreakoutSetup } from '../store'
import { buildRooms, shuffleAssignments } from '../utils/setup'
import { MAIN_ROOM } from '../utils/split'
import { ErrorNote } from './ErrorNote'
import { PersonRow } from './PersonRow'
import { RoomCountField } from './RoomCountField'
import { useAssignablePeople } from '../hooks/useAssignablePeople'
import { useOpenShortcut } from '../hooks/useOpenShortcut'
import { useRoomMetadata } from '@/features/recording/hooks/useRoomMetadata'
import { RecordingStatus } from '@/features/recording/hooks/useRecordingStatuses'

// Someone left unassigned stays in the main room.
const UNASSIGNED = MAIN_ROOM

export const BreakoutSetup = ({ roomId }: { roomId: string }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'breakout' })
  // In the store, so switching panels keeps the plan.
  const { roomCount, assignments } = useSnapshot(breakoutSetupStore)

  const { people, hasNonBrowsers } = useAssignablePeople()
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
          <PersonRow
            key={p.identity}
            name={p.label}
            items={roomItems}
            selectedKey={roomOf(p.identity)}
            onChange={(room) =>
              (breakoutSetupStore.assignments[p.identity] = room)
            }
          />
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
