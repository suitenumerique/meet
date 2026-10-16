import {
  ConnectionState,
  Room,
  RoomEvent,
  type ReconnectContext,
  type ReconnectPolicy,
  type RoomOptions,
} from 'livekit-client'
import type { ApiConfig } from '@/api/useConfig'

/**
 * Until the first attempt of a reconnection starts, the room still reports
 * Connected and LiveKit keeps checking its transport for a while.
 * Around 10s after the initial drop, it will try a full websocket reconnection.
 * Hence, the first attempt should start well before that.
 */
export const MAX_FIRST_DELAY_MS = 5_000

type ReconnectConfig = NonNullable<ApiConfig['livekit']['reconnect']>

type Reconnection = {
  startedAt: number
  // Higher than 0 when the previous reconnection ended shortly before
  firstStep: number
  failedAttempts: number
  isMediaLost: boolean
  gaveUp: boolean
}

/**
 * When a LiveKit node crashes or Redis stalls, every client loses its signal
 * connection at the same time. This policy implements an exponential backoff
 * with some randomness to spread the reconnections out.
 *
 * The policy keeps its own clock since LiveKit calls the policy again on every
 * new disconnection trigger
 */
export class BackoffReconnectPolicy implements ReconnectPolicy {
  lastReconnectionDurationMs: number | undefined
  private readonly config: ReconnectConfig
  private reconnection: Reconnection | undefined
  private lastRecovery: { at: number; step: number } | undefined

  constructor(config: ReconnectConfig) {
    this.config = config
  }

  attach(room: Room) {
    room.on(RoomEvent.Connected, this.handleRecovery)
    room.on(RoomEvent.Reconnected, this.handleRecovery)
    room.on(RoomEvent.Reconnecting, this.handleMediaLost)
    room.on(RoomEvent.ConnectionStateChanged, this.handleStateChange)
  }

  get gaveUp() {
    return this.reconnection?.gaveUp ?? false
  }

  nextRetryDelayInMs({ retryCount }: ReconnectContext): number | null {
    const now = performance.now()
    this.reconnection ??= this.startReconnection(now)
    const reconnection = this.reconnection

    reconnection.failedAttempts = Math.max(
      reconnection.failedAttempts,
      retryCount
    )

    if (
      now - reconnection.startedAt >= this.config.give_up_after_ms &&
      reconnection.isMediaLost
    ) {
      reconnection.gaveUp = true
      return null
    }

    const ceiling = Math.min(
      this.config.max_delay_ms,
      this.config.base_delay_ms *
        2 ** (reconnection.firstStep + reconnection.failedAttempts)
    )

    if (reconnection.failedAttempts === 0) {
      // LiveKit re-arms its timer on each trigger: count from the first drop
      const timeLeft = reconnection.startedAt + MAX_FIRST_DELAY_MS - now
      return Math.floor(
        Math.random() * Math.min(ceiling, Math.max(timeLeft, 0))
      )
    }
    return Math.floor((ceiling / 2) * (1 + Math.random()))
  }

  private startReconnection(now: number): Reconnection {
    const recovery = this.lastRecovery

    const isLastDisconnectionRecent =
      recovery !== undefined && now - recovery.at < this.config.backoff_reset_ms

    return {
      startedAt: now,
      firstStep: isLastDisconnectionRecent ? recovery.step + 1 : 0,
      failedAttempts: 0,
      isMediaLost: false,
      gaveUp: false,
    }
  }

  private handleMediaLost = () => {
    this.reconnection ??= this.startReconnection(performance.now())
    this.reconnection.isMediaLost = true
  }

  private handleStateChange = (state: ConnectionState) => {
    if (state === ConnectionState.Connecting) this.reconnection = undefined
  }

  private handleRecovery = () => {
    const now = performance.now()
    if (this.reconnection) {
      const { startedAt, firstStep, failedAttempts } = this.reconnection
      this.lastRecovery = { at: now, step: firstStep + failedAttempts }
      this.lastReconnectionDurationMs = now - startedAt
      this.reconnection = undefined
    } else {
      // LiveKit can emit Reconnected several times for a full reconnection
      // We want to avoid duplicating the reconnection duration in PostHog
      this.lastReconnectionDurationMs = undefined
    }
  }
}

/**
 * Build a room with the reconnection policy from the config endpoint.
 * Without it, the room keeps the LiveKit default policy
 */
export const createLiveKitRoom = (
  options: RoomOptions,
  config?: ReconnectConfig
): Room => {
  if (!config?.backoff_enabled) return new Room(options)

  const reconnectPolicy = new BackoffReconnectPolicy(config)
  const room = new Room({ ...options, reconnectPolicy })
  reconnectPolicy.attach(room)
  return room
}
