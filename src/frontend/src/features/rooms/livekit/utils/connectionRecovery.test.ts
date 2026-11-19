import { DisconnectReason } from 'livekit-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/ApiError'
import type { ApiLiveKit } from '@/features/rooms/api/ApiRoom'
import type { LiveKitRoomRequest } from '@/features/rooms/api/liveKitRoomRequest'
import { ConnectionEndReason } from '@/features/rooms/utils/connectionEndReason'
import {
  ASK_TIMEOUT_MS,
  type AskAnswer,
  checkAnswer,
  classifyAskError,
  ConnectionRecovery,
  type FailedConnection,
  MAX_ASKS,
  NODE_WINDOW_MS,
  planRecovery,
  type RecoveryHost,
  ROOM_WINDOW_MS,
  STABLE_CONNECTION_MS,
} from './connectionRecovery'

const credentials = (url: string, roomSid?: string): ApiLiveKit => ({
  url,
  room: 'room',
  token: `token-${url}-${roomSid}`,
  ...(roomSid && { room_sid: roomSid }),
})

const INITIAL = credentials('wss://a.example.com', 'RM_initial')
const MOVED = credentials('wss://b.example.com', 'RM_moved')

const LOCATE: LiveKitRoomRequest = { kind: 'locate' }

const missing = (failedRoomSid: string): LiveKitRoomRequest => ({
  kind: 'recover',
  failure: 'missing',
  failedRoomSid,
})

const deleted = (failedRoomSid: string): LiveKitRoomRequest => ({
  kind: 'recover',
  failure: 'deleted',
  failedRoomSid,
})

const { MeetingEnded: ENDED, Failed: FAILED, Lost: LOST } = ConnectionEndReason
const { ROOM_DELETED } = DisconnectReason

const failed = (overrides: Partial<FailedConnection>): FailedConnection => ({
  connected: false,
  credentials: INITIAL,
  everConnected: false,
  ...overrides,
})

const ask = (request: LiveKitRoomRequest, windowMs: number) => ({
  type: 'ask',
  request,
  windowMs,
})
const ends = (reason?: DisconnectReason | ConnectionEndReason) => ({
  type: 'end',
  reason,
})

describe('planRecovery', () => {
  const Reason = DisconnectReason
  const LOCATE_AMONG_ROOM = ask(LOCATE, ROOM_WINDOW_MS)
  const LOCATE_AMONG_NODE = ask(LOCATE, NODE_WINDOW_MS)
  const REPORT_DELETED = ask(deleted('RM_live'), ROOM_WINDOW_MS)
  const REPORT_MISSING = ask(missing('RM_initial'), ROOM_WINDOW_MS)
  const always = (plan: unknown): [unknown, unknown] => [plan, plan]
  const PLANS = new Map<DisconnectReason | undefined, [unknown, unknown]>([
    [Reason.CLIENT_INITIATED, always(ends())],
    [Reason.DUPLICATE_IDENTITY, always(ends(Reason.DUPLICATE_IDENTITY))],
    [Reason.PARTICIPANT_REMOVED, always(ends(Reason.PARTICIPANT_REMOVED))],
    [Reason.ROOM_DELETED, always(REPORT_DELETED)],
    [Reason.USER_REJECTED, [REPORT_MISSING, LOCATE_AMONG_NODE]],
  ])
  const ALL_REASONS = Object.values(Reason).filter(
    (value): value is DisconnectReason => typeof value === 'number'
  )

  it('plans every reason the SDK knows, before and after connecting', () => {
    expect(ALL_REASONS).toHaveLength(17)
    for (const reason of [...ALL_REASONS, undefined]) {
      const [before, after] = PLANS.get(reason) ?? [
        LOCATE_AMONG_ROOM,
        LOCATE_AMONG_NODE,
      ]
      const failure = failed({ reason, liveSid: 'RM_live' })
      expect(planRecovery(failure), `${reason}`).toEqual(before)
      expect(
        planRecovery({ ...failure, connected: true }),
        `${reason}, once connected`
      ).toEqual(after)
    }
  })

  it('ends on a deleted room whose live SID is unknown', () => {
    expect(planRecovery(failed({ reason: Reason.ROOM_DELETED }))).toEqual(
      ends(Reason.ROOM_DELETED)
    )
  })

  it('ensures a refused room whose SID is unknown', () => {
    const credentialsWithoutSid = credentials(INITIAL.url)
    expect(
      planRecovery(
        failed({
          reason: Reason.USER_REJECTED,
          credentials: credentialsWithoutSid,
        })
      )
    ).toEqual(ask({ kind: 'ensure' }, ROOM_WINDOW_MS))
  })
})

describe('checkAnswer', () => {
  const CONNECT = { type: 'connect' }
  const DELETED = deleted('RM_live')
  const SAME_SID = credentials(INITIAL.url, 'RM_live')
  const NO_SID = credentials(INITIAL.url)
  const NEVER_UP = failed({})
  const NEVER_UP_AGAIN = failed({ everConnected: true })
  const WAS_UP = failed({ connected: true, everConnected: true })

  it.each([
    ['a deleted room and no SID', DELETED, NO_SID, WAS_UP, ends(ROOM_DELETED)],
    ['a deleted room that stayed', DELETED, SAME_SID, WAS_UP, ends(ENDED)],
    ['a deleted room that moved', DELETED, MOVED, WAS_UP, CONNECT],
    ['a missing room', missing('RM_initial'), INITIAL, NEVER_UP, CONNECT],
    ['a first attempt, same room', LOCATE, INITIAL, NEVER_UP, ends(FAILED)],
    ['a later attempt, same room', LOCATE, INITIAL, NEVER_UP_AGAIN, ends(LOST)],
    ['a failed attempt, room moved', LOCATE, MOVED, NEVER_UP, CONNECT],
    ['a lost connection, same room', LOCATE, INITIAL, WAS_UP, CONNECT],
  ])('checks %s', (_case, request, answer, failure, expected) => {
    expect(checkAnswer(request, answer, failure)).toEqual(expected)
  })
})

describe('classifyAskError', () => {
  it.each([
    [new ApiError(409, {}), { ...ends(ENDED), unexpected: false }],
    [new ApiError(410, {}), { ...ends(ROOM_DELETED), unexpected: false }],
    [new ApiError(429, {}), { type: 'retry' }],
    [new ApiError(503, {}), { type: 'retry' }],
    [new TypeError('Failed to fetch'), { type: 'retry' }],
    [new ApiError(400, {}), { ...ends(LOST), unexpected: true }],
    [new Error('boom'), { ...ends(LOST), unexpected: true }],
  ])('classifies %s', (error, expected) => {
    expect(classifyAskError(error, true)).toEqual(expected)
  })
})

const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms)

const setup = ({ isEnabled = true } = {}) => {
  const host = {
    isEnabled: vi.fn(() => isEnabled),
    initialCredentials: vi.fn(() => INITIAL),
    ask: vi.fn<RecoveryHost['ask']>(),
    connect: vi.fn<RecoveryHost['connect']>(async () => undefined),
    disconnect: vi.fn<RecoveryHost['disconnect']>(async () => undefined),
    setRecovering: vi.fn<RecoveryHost['setRecovering']>(),
    end: vi.fn<RecoveryHost['end']>(),
    requireLobby: vi.fn<RecoveryHost['requireLobby']>(),
    reportUnexpected: vi.fn<RecoveryHost['reportUnexpected']>(),
  } satisfies RecoveryHost
  const answerWith = (...answers: Array<AskAnswer | Error>) => {
    for (const answer of answers) {
      host.ask.mockImplementationOnce(async () => {
        if (answer instanceof Error) throw answer
        return answer
      })
    }
  }
  return { host, recovery: new ConnectionRecovery(host), answerWith }
}

const ANY_SIGNAL = expect.any(AbortSignal)

describe('ConnectionRecovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('follows a deleted room to the cluster it moved to', async () => {
    const { host, recovery, answerWith } = setup()
    answerWith(MOVED)
    recovery.handleConnected()

    recovery.handleDisconnected(DisconnectReason.ROOM_DELETED, 'RM_live')
    expect(host.setRecovering).toHaveBeenLastCalledWith(true)
    await wait(ROOM_WINDOW_MS / 2 - 1)
    expect(host.ask).not.toHaveBeenCalled()
    await wait(1)

    expect(host.ask).toHaveBeenCalledExactlyOnceWith(
      deleted('RM_live'),
      ANY_SIGNAL
    )
    expect(host.connect).toHaveBeenCalledExactlyOnceWith(MOVED, ANY_SIGNAL)

    recovery.handleConnected()
    expect(host.setRecovering).toHaveBeenLastCalledWith(false)
    expect(host.end).not.toHaveBeenCalled()
  })

  it.each([
    ['hands out the same room', credentials(INITIAL.url, 'RM_live')],
    ['answers a 409', new ApiError(409, {})],
  ])('ends the meeting when the backend %s', async (_case, answer) => {
    const { host, recovery, answerWith } = setup()
    answerWith(answer)
    recovery.handleConnected()

    recovery.handleDisconnected(DisconnectReason.ROOM_DELETED, 'RM_live')
    await wait(ROOM_WINDOW_MS)

    expect(host.connect).not.toHaveBeenCalled()
    expect(host.end).toHaveBeenCalledExactlyOnceWith(
      ConnectionEndReason.MeetingEnded
    )
  })

  it('asks where a lost room is, and reports it missing once refused', async () => {
    const { host, recovery, answerWith } = setup()
    answerWith(INITIAL, MOVED)
    recovery.handleConnected()

    recovery.handleDisconnected(undefined, 'RM_live')
    await wait(NODE_WINDOW_MS / 2 - 1)
    expect(host.ask).not.toHaveBeenCalled()
    await wait(1)
    expect(host.ask).toHaveBeenLastCalledWith(LOCATE, ANY_SIGNAL)
    expect(host.connect).toHaveBeenLastCalledWith(INITIAL, ANY_SIGNAL)

    recovery.handleDisconnected(DisconnectReason.USER_REJECTED)
    await wait(ROOM_WINDOW_MS)
    expect(host.ask).toHaveBeenCalledOnce()
    await wait(ROOM_WINDOW_MS)
    expect(host.ask).toHaveBeenLastCalledWith(missing('RM_initial'), ANY_SIGNAL)
    expect(host.connect).toHaveBeenLastCalledWith(MOVED, ANY_SIGNAL)
  })

  it('ends when a connection that never came up has nowhere else to go', async () => {
    const { host, recovery, answerWith } = setup()
    answerWith(INITIAL)

    recovery.handleDisconnected(DisconnectReason.JOIN_FAILURE)
    await wait(ROOM_WINDOW_MS)

    expect(host.ask).toHaveBeenCalledExactlyOnceWith(LOCATE, ANY_SIGNAL)
    expect(host.connect).not.toHaveBeenCalled()
    expect(host.end).toHaveBeenCalledExactlyOnceWith(ConnectionEndReason.Failed)
  })

  it('ends once its asks went to connections that did not hold', async () => {
    const { host, recovery, answerWith } = setup()
    answerWith(INITIAL, INITIAL, INITIAL)

    for (let cycle = 0; cycle <= MAX_ASKS; cycle++) {
      recovery.handleConnected()
      await wait(STABLE_CONNECTION_MS - 1)
      recovery.handleReconnecting()
      await wait(180_000)
      recovery.handleDisconnected(undefined, 'RM_live')
      await wait(2 * NODE_WINDOW_MS)
    }

    expect(host.ask).toHaveBeenCalledTimes(MAX_ASKS)
    expect(host.end).toHaveBeenCalledExactlyOnceWith(ConnectionEndReason.Lost)
  })

  it('gets its asks back once a connection held', async () => {
    const { host, recovery, answerWith } = setup()
    answerWith(INITIAL, INITIAL, INITIAL, INITIAL)

    for (let cycle = 0; cycle <= MAX_ASKS; cycle++) {
      recovery.handleConnected()
      await wait(1_000)
      recovery.handleReconnecting()
      recovery.handleReconnected()
      await wait(STABLE_CONNECTION_MS)
      recovery.handleDisconnected(DisconnectReason.SERVER_SHUTDOWN, 'RM_live')
      await wait(2 * NODE_WINDOW_MS)
    }

    expect(host.ask).toHaveBeenCalledTimes(MAX_ASKS + 1)
    expect(host.end).not.toHaveBeenCalled()
  })

  it('asks again after a server error and after a timeout', async () => {
    const { host, recovery } = setup()
    host.ask
      .mockRejectedValueOnce(new ApiError(503, {}))
      .mockImplementationOnce(
        (_request, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason))
          })
      )
      .mockResolvedValueOnce(MOVED)
    recovery.handleConnected()

    recovery.handleDisconnected(DisconnectReason.ROOM_DELETED, 'RM_live')
    await wait(ROOM_WINDOW_MS)
    expect(host.ask).toHaveBeenCalledTimes(1)
    await wait(2 * ROOM_WINDOW_MS)
    expect(host.ask).toHaveBeenCalledTimes(2)
    await wait(ASK_TIMEOUT_MS + 2 * ROOM_WINDOW_MS)

    expect(host.ask).toHaveBeenCalledTimes(3)
    expect(host.connect).toHaveBeenCalledExactlyOnceWith(MOVED, ANY_SIGNAL)
    expect(host.reportUnexpected).not.toHaveBeenCalled()
  })

  it('reports an unexpected ask error and ends', async () => {
    const { host, recovery, answerWith } = setup()
    const error = new ApiError(400, {})
    answerWith(error)

    recovery.handleDisconnected(DisconnectReason.USER_REJECTED)
    await wait(ROOM_WINDOW_MS)

    expect(host.reportUnexpected).toHaveBeenCalledExactlyOnceWith(error)
    expect(host.end).toHaveBeenCalledExactlyOnceWith(ConnectionEndReason.Failed)
  })

  it('sends a participant who has to wait back to the lobby', async () => {
    const { host, recovery, answerWith } = setup()
    answerWith('lobby')

    recovery.handleDisconnected(DisconnectReason.USER_REJECTED)
    await wait(ROOM_WINDOW_MS)

    expect(host.requireLobby).toHaveBeenCalledOnce()
    expect(host.setRecovering).toHaveBeenLastCalledWith(false)
    expect(host.end).not.toHaveBeenCalled()
  })

  it('ends as removed for a participant denied entry', async () => {
    const { host, recovery, answerWith } = setup()
    answerWith('denied')

    recovery.handleDisconnected(DisconnectReason.USER_REJECTED)
    await wait(ROOM_WINDOW_MS)

    expect(host.end).toHaveBeenCalledExactlyOnceWith(
      DisconnectReason.PARTICIPANT_REMOVED
    )
  })

  it('never asks once left during the wait', async () => {
    const { host, recovery } = setup()

    recovery.handleDisconnected(DisconnectReason.USER_REJECTED)
    recovery.leave()
    await wait(ROOM_WINDOW_MS)

    expect(host.ask).not.toHaveBeenCalled()
    expect(host.disconnect).toHaveBeenCalledOnce()
    expect(host.end).toHaveBeenCalledExactlyOnceWith(undefined)
  })

  it('never connects once left during the ask', async () => {
    const { host, recovery } = setup()
    let answer: (answer: AskAnswer) => void = () => undefined
    host.ask.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve
        })
    )

    recovery.handleDisconnected(DisconnectReason.USER_REJECTED)
    await wait(ROOM_WINDOW_MS)
    recovery.leave()
    answer(MOVED)
    await wait(0)

    expect(host.ask.mock.calls[0][1].aborted).toBe(true)
    expect(host.connect).not.toHaveBeenCalled()
    expect(host.end).toHaveBeenCalledExactlyOnceWith(undefined)
  })

  it('fails an attempt whose connect rejects without a disconnection', async () => {
    const { host, recovery, answerWith } = setup()
    answerWith(MOVED, MOVED)
    host.connect.mockRejectedValueOnce(new Error('The config is not loaded'))
    recovery.handleConnected()

    recovery.handleDisconnected(DisconnectReason.ROOM_DELETED, 'RM_live')
    await wait(ROOM_WINDOW_MS)
    expect(host.disconnect).toHaveBeenCalledOnce()
    await wait(2 * ROOM_WINDOW_MS)

    expect(host.ask).toHaveBeenLastCalledWith(LOCATE, ANY_SIGNAL)
    expect(host.end).toHaveBeenCalledExactlyOnceWith(ConnectionEndReason.Lost)
  })

  it('leaves a rejected connect to the disconnection that told of it', async () => {
    const { host, recovery, answerWith } = setup()
    answerWith(MOVED, INITIAL)
    host.connect.mockImplementationOnce(async () => {
      recovery.handleDisconnected(DisconnectReason.USER_REJECTED)
      throw new Error('refused')
    })
    recovery.handleConnected()

    recovery.handleDisconnected(DisconnectReason.ROOM_DELETED, 'RM_live')
    await wait(3 * ROOM_WINDOW_MS)

    expect(host.disconnect).not.toHaveBeenCalled()
    expect(host.ask).toHaveBeenLastCalledWith(missing('RM_moved'), ANY_SIGNAL)
    expect(host.connect).toHaveBeenLastCalledWith(INITIAL, ANY_SIGNAL)
  })

  it.each([
    [DisconnectReason.ROOM_DELETED, true, DisconnectReason.ROOM_DELETED],
    [DisconnectReason.SERVER_SHUTDOWN, true, ConnectionEndReason.Lost],
    [DisconnectReason.JOIN_FAILURE, false, ConnectionEndReason.Failed],
  ])(
    'ends as before when recovery is disabled (reason %s)',
    (reason, connected, expected) => {
      const { host, recovery } = setup({ isEnabled: false })
      if (connected) recovery.handleConnected()

      recovery.handleDisconnected(reason, 'RM_live')

      expect(host.setRecovering).not.toHaveBeenCalledWith(true)
      expect(host.end).toHaveBeenCalledExactlyOnceWith(expected)
    }
  )
})
