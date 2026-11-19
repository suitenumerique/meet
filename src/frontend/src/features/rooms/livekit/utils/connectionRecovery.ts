import { DisconnectReason } from 'livekit-client'
import type { ApiLiveKit } from '@/features/rooms/api/ApiRoom'
import type { LiveKitRoomRequest } from '@/features/rooms/api/liveKitRoomRequest'
import { ConnectionEndReason } from '@/features/rooms/utils/connectionEndReason'

export const MAX_ASKS = 3
export const STABLE_CONNECTION_MS = 30_000
// Above the backend's bound of two 10 s CreateRooms
export const ASK_TIMEOUT_MS = 30_000
// A deleted or refused room only fails its own participants
export const ROOM_WINDOW_MS = 1_000
// Any other loss may hit every room of a LiveKit node at once
export const NODE_WINDOW_MS = 3_000

export type RecoveryEndReason =
  | DisconnectReason
  | ConnectionEndReason
  | undefined

type RecoveryEnd = { type: 'end'; reason: RecoveryEndReason }
type RecoveryAsk = {
  type: 'ask'
  request: LiveKitRoomRequest
  windowMs: number
}
export type RecoveryPlan = RecoveryEnd | RecoveryAsk

export type FailedConnection = {
  reason?: DisconnectReason
  connected: boolean
  liveSid?: string
  credentials?: ApiLiveKit
  everConnected: boolean
}

export type AskAnswer = ApiLiveKit | 'lobby' | 'denied'

const end = (reason: RecoveryEndReason): RecoveryEnd => ({
  type: 'end',
  reason,
})

const lostOrFailed = (everConnected: boolean) =>
  everConnected ? ConnectionEndReason.Lost : ConnectionEndReason.Failed

export const endReasonWithoutRecovery = (
  reason: DisconnectReason | undefined,
  everConnected: boolean
): RecoveryEndReason => {
  switch (reason) {
    case DisconnectReason.CLIENT_INITIATED:
      return undefined
    case DisconnectReason.DUPLICATE_IDENTITY:
    case DisconnectReason.PARTICIPANT_REMOVED:
    case DisconnectReason.ROOM_DELETED:
      return reason
    default:
      return lostOrFailed(everConnected)
  }
}

// Only a room that LiveKit refused before connecting is reported missing
export const planRecovery = ({
  reason,
  connected,
  liveSid,
  credentials,
}: FailedConnection): RecoveryPlan => {
  switch (reason) {
    case DisconnectReason.CLIENT_INITIATED:
      return end(undefined)
    case DisconnectReason.DUPLICATE_IDENTITY:
    case DisconnectReason.PARTICIPANT_REMOVED:
      return end(reason)
    case DisconnectReason.ROOM_DELETED:
      return liveSid
        ? {
            type: 'ask',
            request: {
              kind: 'recover',
              failure: 'deleted',
              failedRoomSid: liveSid,
            },
            windowMs: ROOM_WINDOW_MS,
          }
        : end(reason)
  }
  if (!connected && reason === DisconnectReason.USER_REJECTED) {
    const failedRoomSid = credentials?.room_sid
    return {
      type: 'ask',
      request: failedRoomSid
        ? { kind: 'recover', failure: 'missing', failedRoomSid }
        : { kind: 'ensure' },
      windowMs: ROOM_WINDOW_MS,
    }
  }
  return {
    type: 'ask',
    request: { kind: 'locate' },
    windowMs: connected ? NODE_WINDOW_MS : ROOM_WINDOW_MS,
  }
}

// Never back to a room that was deleted, nor to one that could not be reached
export const checkAnswer = (
  request: LiveKitRoomRequest,
  answer: ApiLiveKit,
  failed: FailedConnection
): RecoveryEnd | { type: 'connect' } => {
  if (request.kind === 'recover' && request.failure === 'deleted') {
    // A backend that predates recovery hands out no SID
    if (!answer.room_sid) return end(DisconnectReason.ROOM_DELETED)
    if (answer.room_sid === request.failedRoomSid) {
      return end(ConnectionEndReason.MeetingEnded)
    }
  }
  if (
    request.kind === 'locate' &&
    !failed.connected &&
    answer.url === failed.credentials?.url &&
    answer.room_sid === failed.credentials?.room_sid
  ) {
    return end(lostOrFailed(failed.everConnected))
  }
  return { type: 'connect' }
}

const statusOf = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'statusCode' in error &&
  typeof error.statusCode === 'number'
    ? error.statusCode
    : undefined

export const classifyAskError = (
  error: unknown,
  everConnected: boolean
): { type: 'retry' } | (RecoveryEnd & { unexpected: boolean }) => {
  const status = statusOf(error)
  if (status === 409) {
    return { ...end(ConnectionEndReason.MeetingEnded), unexpected: false }
  }
  if (status === 410) {
    return { ...end(DisconnectReason.ROOM_DELETED), unexpected: false }
  }
  const isNetworkError = status === undefined && error instanceof TypeError
  if (status === 429 || (status ?? 0) >= 500 || isNetworkError) {
    return { type: 'retry' }
  }
  return { ...end(lostOrFailed(everConnected)), unexpected: true }
}

export interface RecoveryHost {
  isEnabled(): boolean
  initialCredentials(): ApiLiveKit | undefined
  ask(request: LiveKitRoomRequest, signal: AbortSignal): Promise<AskAnswer>
  connect(credentials: ApiLiveKit, signal: AbortSignal): Promise<void>
  disconnect(): Promise<void>
  setRecovering(isRecovering: boolean): void
  end(reason: RecoveryEndReason): void
  requireLobby(): void
  reportUnexpected(error: unknown): void
}

export class ConnectionRecovery {
  private readonly host: RecoveryHost
  private state: 'live' | 'recovering' | 'ended' = 'live'
  private credentials: ApiLiveKit | undefined
  private connected = false
  private everConnected = false
  private upSince: number | undefined
  private asks = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private abort: AbortController | undefined

  constructor(host: RecoveryHost) {
    this.host = host
  }

  handleConnected() {
    this.everConnected = true
    this.upSince = Date.now()
    if (this.state !== 'live') return
    this.connected = true
    this.host.setRecovering(false)
  }

  handleReconnecting() {
    this.settleUptime()
  }

  handleReconnected() {
    this.upSince = Date.now()
  }

  handleDisconnected(reason?: DisconnectReason, liveSid?: string) {
    this.settleUptime()
    if (this.state !== 'live') return
    this.abort?.abort()
    this.fail(reason, liveSid)
  }

  leave() {
    if (this.hasEnded()) return
    this.stop()
    this.host.disconnect().catch(() => undefined)
    this.host.end(undefined)
  }

  dispose() {
    this.stop()
  }

  private fail(reason: DisconnectReason | undefined, liveSid?: string) {
    const failed: FailedConnection = {
      reason,
      connected: this.connected,
      liveSid: this.connected ? liveSid : undefined,
      credentials: this.credentials ?? this.host.initialCredentials(),
      everConnected: this.everConnected,
    }
    this.connected = false
    const plan = this.host.isEnabled()
      ? planRecovery(failed)
      : end(endReasonWithoutRecovery(reason, this.everConnected))
    if (plan.type === 'end') {
      this.end(plan.reason)
      return
    }
    this.state = 'recovering'
    this.host.setRecovering(true)
    this.schedule(plan, failed)
  }

  private schedule(plan: RecoveryAsk, failed: FailedConnection) {
    if (this.asks >= MAX_ASKS) {
      this.end(lostOrFailed(this.everConnected))
      return
    }
    const windows = (this.asks === 0 ? 0 : 1) + Math.random()
    this.timer = setTimeout(
      () => void this.ask(plan, failed),
      Math.floor(plan.windowMs * windows)
    )
  }

  private async ask(plan: RecoveryAsk, failed: FailedConnection) {
    this.asks += 1
    const abort = new AbortController()
    this.abort = abort
    const timeout = setTimeout(() => abort.abort(), ASK_TIMEOUT_MS)
    let answer: AskAnswer
    try {
      answer = await this.host.ask(plan.request, abort.signal)
    } catch (error) {
      if (this.hasEnded()) return
      if (abort.signal.aborted) {
        this.schedule(plan, failed)
        return
      }
      const outcome = classifyAskError(error, this.everConnected)
      if (outcome.type === 'retry') {
        this.schedule(plan, failed)
        return
      }
      if (outcome.unexpected) this.host.reportUnexpected(error)
      this.end(outcome.reason)
      return
    } finally {
      clearTimeout(timeout)
    }
    if (this.hasEnded()) return

    if (answer === 'denied') {
      this.end(DisconnectReason.PARTICIPANT_REMOVED)
      return
    }
    if (answer === 'lobby') {
      this.stop()
      this.host.setRecovering(false)
      this.host.requireLobby()
      return
    }
    const check = checkAnswer(plan.request, answer, failed)
    if (check.type === 'end') {
      this.end(check.reason)
      return
    }
    this.connect(answer)
  }

  private connect(credentials: ApiLiveKit) {
    this.credentials = credentials
    this.state = 'live'
    const abort = new AbortController()
    this.abort = abort
    this.host.connect(credentials, abort.signal).catch(async () => {
      if (this.abort !== abort || this.state !== 'live' || this.connected) {
        return
      }
      // No Disconnected event told of this failure: the connect never started
      this.state = 'recovering'
      await this.host.disconnect().catch(() => undefined)
      if (this.hasEnded()) return
      this.fail(undefined)
    })
  }

  private end(reason: RecoveryEndReason) {
    this.stop()
    this.host.end(reason)
  }

  private hasEnded() {
    return this.state === 'ended'
  }

  private stop() {
    this.state = 'ended'
    clearTimeout(this.timer)
    this.abort?.abort()
  }

  private settleUptime() {
    if (
      this.upSince !== undefined &&
      Date.now() - this.upSince >= STABLE_CONNECTION_MS
    ) {
      this.asks = 0
    }
    this.upSince = undefined
  }
}
