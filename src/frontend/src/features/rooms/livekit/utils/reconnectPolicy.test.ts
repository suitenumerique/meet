import { ConnectionState, RoomEvent, type Room } from 'livekit-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BackoffReconnectPolicy,
  createLiveKitRoom,
  MAX_FIRST_DELAY_MS,
} from './reconnectPolicy'

const CONFIG = {
  backoff_enabled: true,
  base_delay_ms: 1_000,
  max_delay_ms: 15_000,
  give_up_after_ms: 300_000,
  backoff_reset_ms: 120_000,
}

const createRoom = () => {
  const listeners = new Map<RoomEvent, Array<(...args: unknown[]) => void>>()
  const room = {
    on(event: RoomEvent, listener: (...args: unknown[]) => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
      return room
    },
    emit(event: RoomEvent, ...args: unknown[]) {
      listeners.get(event)?.forEach((listener) => listener(...args))
    },
    setState(state: ConnectionState, event?: RoomEvent) {
      room.emit(RoomEvent.ConnectionStateChanged, state)
      if (event) room.emit(event)
    },
  }
  return room
}

const setup = ({ config = CONFIG, random = 0.5 } = {}) => {
  const clock = { now: 0 }

  vi.spyOn(Math, 'random').mockReturnValue(random)
  vi.spyOn(performance, 'now').mockImplementation(() => clock.now)

  const room = createRoom()
  const policy = new BackoffReconnectPolicy(config)
  policy.attach(room as unknown as Room)

  const delay = (retryCount: number, elapsedMs = 0) =>
    policy.nextRetryDelayInMs({ retryCount, elapsedMs })

  return { clock, room, policy, delay }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BackoffReconnectPolicy', () => {
  it('doubles the delay ceiling after each failed attempt, up to the cap', () => {
    const { delay } = setup()

    expect([0, 1, 2, 3, 4, 10].map((retryCount) => delay(retryCount))).toEqual([
      500, 1_500, 3_000, 6_000, 11_250, 11_250,
    ])
  })

  it('draws the first delay anywhere below its ceiling (check two extremes)', () => {
    expect(setup({ random: 0 }).delay(0)).toBe(0)
    expect(setup({ random: 0.9999 }).delay(0)).toBe(999)
  })

  it('draws the next delays between half their ceiling and their ceiling (check two extremes)', () => {
    expect(setup({ random: 0 }).delay(3)).toBe(4_000)
    expect(setup({ random: 0.9999 }).delay(3)).toBe(7_999)
  })

  it('keeps the first delay of a reconnection under 5 s', () => {
    const config = { ...CONFIG, base_delay_ms: 8_000 }
    const { delay } = setup({ config, random: 0.9999 })

    expect(delay(0)).toBeLessThan(MAX_FIRST_DELAY_MS)
    expect(delay(1)).toBe(14_999)
  })

  it('starts the first attempt within 5 s of the drop', () => {
    const config = { ...CONFIG, base_delay_ms: 8_000 }
    const { clock, delay } = setup({ config })
    expect(delay(0)).toBe(2_500)

    clock.now = 4_000
    expect(delay(0)).toBe(500)

    clock.now = 6_000
    expect(delay(0)).toBe(0)
  })

  it('never steps the backoff down within a reconnection', () => {
    const { delay } = setup()

    expect(delay(3)).toBe(6_000)
    expect(delay(0)).toBe(6_000)
  })

  it('ignores the elapsed time reported by LiveKit', () => {
    const { delay } = setup()

    expect(delay(1, Date.now())).toBe(1_500)
  })

  it('picks up the backoff of a reconnection that ended shortly before', () => {
    const { clock, room, delay } = setup()
    delay(0)
    delay(1)
    delay(2)
    room.emit(RoomEvent.Reconnected)

    clock.now += 60_000
    // One step above where the last reconnection ended (capped)
    expect(delay(0)).toBe(2_500)
    expect(delay(1)).toBe(11_250)
  })

  it('starts the backoff over once the connection held for the reset delay', () => {
    const { clock, room, delay } = setup()
    delay(0)
    delay(1)
    delay(2)
    room.emit(RoomEvent.Reconnected)

    clock.now += 120_000

    expect(delay(0)).toBe(500)
  })

  it('gives up once the reconnection lasts longer than the give-up delay', () => {
    const { clock, room, policy, delay } = setup()
    delay(0)
    room.setState(ConnectionState.Reconnecting, RoomEvent.Reconnecting)

    clock.now = 299_999

    expect(delay(20)).toBe(11_250)
    expect(policy.gaveUp).toBe(false)

    clock.now = 300_000

    expect(delay(21)).toBeNull()
    expect(policy.gaveUp).toBe(true)
  })

  it('keeps trying while only signaling is down', () => {
    const { clock, room, policy, delay } = setup()
    delay(0)
    room.setState(
      ConnectionState.SignalReconnecting,
      RoomEvent.SignalReconnecting
    )

    clock.now = 600_000

    expect(delay(40)).toBe(11_250)
    expect(policy.gaveUp).toBe(false)

    // The media connection failed as well
    room.setState(ConnectionState.Reconnecting, RoomEvent.Reconnecting)

    expect(delay(41)).toBeNull()
    expect(policy.gaveUp).toBe(true)
  })

  it('gives up once the media connection failed, even back to resuming', () => {
    const { clock, room, policy, delay } = setup()
    delay(0)
    room.setState(
      ConnectionState.SignalReconnecting,
      RoomEvent.SignalReconnecting
    )
    delay(1)

    // The peer connections fail, then LiveKit tries to resume again
    clock.now = 30_000
    room.setState(ConnectionState.Reconnecting, RoomEvent.Reconnecting)
    room.setState(
      ConnectionState.SignalReconnecting,
      RoomEvent.SignalReconnecting
    )

    clock.now = 299_999

    expect(delay(20)).toBe(11_250)
    expect(policy.gaveUp).toBe(false)

    clock.now = 300_000

    expect(delay(21)).toBeNull()
    expect(policy.gaveUp).toBe(true)
  })

  it('starts a new reconnection once the room connects again', () => {
    const { clock, room, policy, delay } = setup()
    delay(0)
    room.setState(ConnectionState.Reconnecting, RoomEvent.Reconnecting)
    clock.now = 300_000

    expect(delay(21)).toBeNull()

    room.setState(ConnectionState.Disconnected, RoomEvent.Disconnected)
    expect(policy.gaveUp).toBe(true)

    room.setState(ConnectionState.Connecting)
    room.setState(ConnectionState.Connected, RoomEvent.Connected)
    expect(policy.gaveUp).toBe(false)

    clock.now += 600_000

    expect(delay(0)).toBe(500)

    // The media connection of the previous reconnection is not lost anymore
    room.setState(
      ConnectionState.SignalReconnecting,
      RoomEvent.SignalReconnecting
    )
    clock.now += 300_000

    expect(delay(20)).toBe(11_250)
  })

  it('starts over when a new join replaces the reconnection', () => {
    const { clock, room, policy, delay } = setup()
    delay(0)
    delay(3)
    room.setState(ConnectionState.Reconnecting, RoomEvent.Reconnecting)

    // LiveKitRoom calls room.connect() again in the middle of the reconnection
    clock.now = 400_000
    room.setState(ConnectionState.Connecting)

    expect(delay(0)).toBe(500)
    expect(policy.gaveUp).toBe(false)
  })

  it('reports how long a reconnection lasted, once', () => {
    const { clock, room, policy, delay } = setup()
    clock.now = 1_000
    delay(0)

    clock.now = 4_000
    room.emit(RoomEvent.Reconnected)
    expect(policy.lastReconnectionDurationMs).toBe(3_000)

    // LiveKit can emit Reconnected several times for one recovery
    room.emit(RoomEvent.Reconnected)
    expect(policy.lastReconnectionDurationMs).toBeUndefined()
  })
})

describe('createLiveKitRoom', () => {
  it('builds the policy from the config endpoint values', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    const { reconnectPolicy } = createLiveKitRoom({}, CONFIG).options

    expect(reconnectPolicy).toBeInstanceOf(BackoffReconnectPolicy)
    expect(
      reconnectPolicy.nextRetryDelayInMs({ retryCount: 2, elapsedMs: 0 })
    ).toBe(3_000)
  })

  it('keeps the default policy when the backoff is missing or disabled', () => {
    for (const config of [undefined, { ...CONFIG, backoff_enabled: false }]) {
      expect(
        createLiveKitRoom({}, config).options.reconnectPolicy
      ).not.toBeInstanceOf(BackoffReconnectPolicy)
    }
  })
})
