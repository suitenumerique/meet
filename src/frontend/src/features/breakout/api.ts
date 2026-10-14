import { fetchApi } from '@/api/fetchApi'
import { keys } from '@/api/queryKeys'

// Names are not stored: each person shows the name they have in the meeting now.
export type BreakoutPerson = { identity: string }

export type BreakoutSession = {
  id: string
  is_active: boolean
  rooms: { id: string; name: string; participants: BreakoutPerson[] }[]
}

export type CreateBreakoutSession = {
  rooms: { name: string; participants: BreakoutPerson[] }[]
  // The host was warned that opening stops the running recording.
  stop_recording?: boolean
}

// One person sent to the room at a position, or to the main room on null.
export type MoveBreakoutParticipant = BreakoutPerson & { room: number | null }

const sessionsUrl = (roomId: string) => `/rooms/${roomId}/breakout-sessions/`

export const breakoutSessionKey = (roomId?: string) => [
  keys.breakoutSession,
  roomId,
]

export const fetchBreakoutSession = async (
  roomId: string
): Promise<BreakoutSession | null> => {
  const sessions = await fetchApi<BreakoutSession[]>(sessionsUrl(roomId))
  return sessions[0] ?? null
}

export const createBreakoutSession = (
  roomId: string,
  body: CreateBreakoutSession
) =>
  fetchApi<BreakoutSession>(sessionsUrl(roomId), {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const moveBreakoutParticipant = (
  roomId: string,
  sessionId: string,
  body: MoveBreakoutParticipant
) =>
  fetchApi<BreakoutSession>(`${sessionsUrl(roomId)}${sessionId}/move/`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

export const closeBreakoutSession = (roomId: string, sessionId: string) =>
  fetchApi(`${sessionsUrl(roomId)}${sessionId}/close/`, { method: 'POST' })
