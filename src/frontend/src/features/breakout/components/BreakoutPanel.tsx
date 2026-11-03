import { useEffect, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { Button, Div, Text } from '@/primitives'
import { queryClient } from '@/api/queryClient'
import { useCanManageBreakout } from '../hooks/useCanManageBreakout'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import {
  useLocalParticipant,
  useRemoteParticipants,
  useRoomInfo,
} from '@livekit/components-react'
import { getParticipantName } from '@/features/rooms/utils/getParticipantName'
import { MAIN_ROOM, readSplit } from '../utils/split'
import { useAssignablePeople } from '../hooks/useAssignablePeople'
import {
  breakoutSessionKey,
  closeBreakoutSession,
  fetchBreakoutSession,
  moveBreakoutParticipant,
  type BreakoutSession,
  type MoveBreakoutParticipant,
} from '../api'
import { BreakoutSetup } from './BreakoutSetup'
import { ErrorNote } from './ErrorNote'
import { PersonRow } from './PersonRow'

const ActiveSession = ({
  roomId,
  session,
  canMove,
  canClose,
}: {
  roomId: string
  session: BreakoutSession
  canMove: boolean
  canClose: boolean
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'breakout' })
  // Someone who left, a guest who reloaded under a new identity included,
  // stays assigned and is no longer listed.
  // Each name is read live, so a rename shows.
  const { localParticipant } = useLocalParticipant()
  const here = new Map(
    [localParticipant, ...useRemoteParticipants()].map((p) => [
      p.identity,
      getParticipantName(p),
    ])
  )
  const close = useMutation({
    mutationFn: () => closeBreakoutSession(roomId, session.id),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: breakoutSessionKey(roomId) }),
  })
  const move = useMutation({
    mutationFn: (body: MoveBreakoutParticipant) =>
      moveBreakoutParticipant(roomId, session.id, body),
    onSuccess: (moved) =>
      queryClient.setQueryData(breakoutSessionKey(roomId), moved),
    onError: () =>
      queryClient.invalidateQueries({ queryKey: breakoutSessionKey(roomId) }),
  })

  // The main room holds whoever is here and in no room, latecomers included.
  const { people } = useAssignablePeople()
  const assigned = new Set(
    session.rooms.flatMap((room) => room.participants.map((p) => p.identity))
  )
  const groups = [
    ...session.rooms.map((room, position) => ({
      position,
      name: room.name,
      people: room.participants.flatMap((p) => {
        const name = here.get(p.identity)
        return name === undefined ? [] : [{ identity: p.identity, name }]
      }),
    })),
    {
      position: MAIN_ROOM,
      name: t('active.mainRoom'),
      people: people.filter((p) => !assigned.has(p.identity)),
    },
  ]
  const roomItems = groups.map((group) => ({
    value: group.position,
    label: group.name,
  }))
  const moveTo = (identity: string, from: number, to: number) => {
    if (to === from) return
    move.mutate({ identity, room: to === MAIN_ROOM ? null : to })
  }
  const me = { identity: localParticipant.identity }
  const isMine = (room: BreakoutSession['rooms'][number]) =>
    room.participants.some((p) => p.identity === me.identity)
  const isInARoom = session.rooms.some(isMine)

  return (
    <>
      <ul
        className={css({
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        })}
      >
        {groups.map((group) => (
          <li key={group.position}>
            <div
              className={css({
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              })}
            >
              <Text variant="bodyXsBold" className={css({ flexGrow: 1 })}>
                {group.name}
              </Text>
              {canMove &&
                group.position !== MAIN_ROOM &&
                !isMine(session.rooms[group.position]) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={t('active.joinRoom', { room: group.name })}
                    isDisabled={move.isPending}
                    onPress={() => move.mutate({ ...me, room: group.position })}
                  >
                    {t('active.join')}
                  </Button>
                )}
            </div>
            {group.people.length === 0 && (
              <Text variant="xsNote">{t('active.empty')}</Text>
            )}
            <ul>
              {group.people.map((p) => (
                <PersonRow
                  key={p.identity}
                  name={p.name}
                  items={roomItems}
                  selectedKey={group.position}
                  isDisabled={!canMove || move.isPending}
                  onChange={(to) => moveTo(p.identity, group.position, to)}
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {(close.isError || move.isError) && <ErrorNote />}
      {canMove && isInARoom && (
        <Button
          variant="secondary"
          fullWidth
          isDisabled={move.isPending}
          onPress={() => move.mutate({ ...me, room: null })}
        >
          {t('active.backToMain')}
        </Button>
      )}
      {/* A host demoted while the panel is open loses Close with the rest. */}
      {canClose && (
        <Button
          variant="primary"
          fullWidth
          isDisabled={close.isPending}
          onPress={() => close.mutate()}
        >
          {t('active.close')}
        </Button>
      )}
    </>
  )
}

export const BreakoutPanel = () => {
  const roomId = useRoomData()?.id
  const { canOpen, canClose } = useCanManageBreakout()
  // The split the metadata announces, null outside one. readSplit returns a
  // new object only when the split itself changed: an open, a move or a close.
  const announced = readSplit(useRoomInfo().metadata)
  const {
    data: session,
    isPending,
    isError,
  } = useQuery({
    queryKey: breakoutSessionKey(roomId),
    queryFn: () => fetchBreakoutSession(roomId as string),
    enabled: !!roomId,
    retry: false,
  })
  // Another host opened, moved someone or closed: refetch, and keep showing
  // the current session until the answer lands.
  const seen = useRef(announced)
  useEffect(() => {
    if (seen.current === announced) return
    seen.current = announced
    void queryClient.invalidateQueries({ queryKey: breakoutSessionKey(roomId) })
  }, [announced, roomId])
  if (!roomId || isPending) return null

  return (
    <Div
      display="flex"
      overflowY="auto"
      padding="0 1.5rem 1.5rem"
      flexGrow={1}
      flexDirection="column"
      gap="1rem"
    >
      {isError && <ErrorNote />}
      {session && (
        <ActiveSession
          roomId={roomId}
          session={session}
          canMove={canOpen}
          canClose={canClose}
        />
      )}
      {/* A first list that failed leaves no form: Open would fail as well. */}
      {session === null && canOpen && <BreakoutSetup roomId={roomId} />}
    </Div>
  )
}
