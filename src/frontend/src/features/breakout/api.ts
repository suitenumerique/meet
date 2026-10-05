import { fetchApi } from '@/api/fetchApi'
import { keys } from '@/api/queryKeys'

export type BreakoutPerson = { identity: string; name: string }

export type BreakoutSession = {
  id: string
  status: 'active' | 'closed'
  rooms: { id: string; name: string; participants: BreakoutPerson[] }[]
}

export type CreateBreakoutSession = {
  rooms: { name: string; participants: BreakoutPerson[] }[]
  // The host was warned that opening stops the running recording.
  stop_recording?: boolean
}

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

export const closeBreakoutSession = (roomId: string, sessionId: string) =>
  fetchApi(`${sessionsUrl(roomId)}${sessionId}/close/`, { method: 'POST' })
