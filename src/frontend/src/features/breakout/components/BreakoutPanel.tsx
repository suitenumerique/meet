import { useEffect, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { Button, Div, Text } from '@/primitives'
import { queryClient } from '@/api/queryClient'
import { useCanManageBreakout } from '../hooks/useCanManageBreakout'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import {
  useLocalParticipant,
  useRemoteParticipants,
  useRoomInfo,
} from '@livekit/components-react'
import { getParticipantName } from '@/features/rooms/utils/getParticipantName'
import { readSplit } from '../utils/split'
import {
  breakoutSessionKey,
  closeBreakoutSession,
  fetchBreakoutSession,
  moveBreakoutParticipant,
  type BreakoutSession,
} from '../api'
import { BreakoutSetup } from './BreakoutSetup'
import { ErrorNote } from './ErrorNote'

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
  const namesHere = (room: BreakoutSession['rooms'][number]) =>
    room.participants
      .filter((p) => here.has(p.identity))
      .map((p) => here.get(p.identity))
      .join(', ')
  const close = useMutation({
    mutationFn: () => closeBreakoutSession(roomId, session.id),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: breakoutSessionKey(roomId) }),
  })
  // The host sends their own browser to a room, or to the main room on null.
  const move = useMutation({
    mutationFn: (position: number | null) =>
      moveBreakoutParticipant(roomId, session.id, {
        identity: localParticipant.identity,
        name: getParticipantName(localParticipant),
        room: position,
      }),
    onSuccess: (moved) =>
      queryClient.setQueryData(breakoutSessionKey(roomId), moved),
    onError: () =>
      queryClient.invalidateQueries({ queryKey: breakoutSessionKey(roomId) }),
  })
  const isMine = (room: BreakoutSession['rooms'][number]) =>
    room.participants.some((p) => p.identity === localParticipant.identity)
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
        {session.rooms.map((room, position) => (
          <li
            key={room.id}
            className={css({
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            })}
          >
            <div className={css({ flexGrow: 1 })}>
              <Text variant="bodyXsBold">{room.name}</Text>
              <Text variant="xsNote" wrap="pretty">
                {namesHere(room) || t('active.empty')}
              </Text>
            </div>
            {canMove && !isMine(room) && (
              <Button
                variant="secondary"
                size="sm"
                aria-label={t('active.joinRoom', { room: room.name })}
                isDisabled={move.isPending}
                onPress={() => move.mutate(position)}
              >
                {t('active.join')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {(close.isError || move.isError) && <ErrorNote />}
      {canMove && isInARoom && (
        <Button
          variant="secondary"
          fullWidth
          isDisabled={move.isPending}
          onPress={() => move.mutate(null)}
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
  const { canOpen } = useCanManageBreakout()
  // Close follows the role alone: a split outlives the flag and its key.
  const isAdminOrOwner = useIsAdminOrOwner()
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
  // Another host opened, joined a room or closed: refetch, and keep showing
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
          canClose={isAdminOrOwner}
        />
      )}
      {/* A first list that failed leaves no form: Open would fail as well. */}
      {session === null && canOpen && <BreakoutSetup roomId={roomId} />}
    </Div>
  )
}
