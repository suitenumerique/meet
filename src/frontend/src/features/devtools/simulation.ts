import { Room, Track } from 'livekit-client'
// Transitive dependency of livekit-client (pinned by it); used only to
// build the one signal request room.simulateScenario cannot express.
import { SimulateScenario } from '@livekit/protocol'

/** Shared bandwidth ladder for the −/+ steppers; null = unlimited. */
export const BITRATE_LADDER_KBPS: Array<number | null> = [
  null,
  2000,
  1000,
  600,
  300,
  150,
]

export const stepBitrate = (
  current: number | null,
  direction: 'decrease' | 'increase'
): number | null => {
  const index = BITRATE_LADDER_KBPS.indexOf(current)
  const safeIndex = index === -1 ? 0 : index
  const next =
    direction === 'decrease'
      ? Math.min(safeIndex + 1, BITRATE_LADDER_KBPS.length - 1)
      : Math.max(safeIndex - 1, 0)
  return BITRATE_LADDER_KBPS[next]
}

const savedEncodings = new WeakMap<RTCRtpSender, Array<number | undefined>>()

export const setUplinkCap = async (
  room: Room,
  kbps: number | null
): Promise<void> => {
  const senders: RTCRtpSender[] = []
  room.localParticipant.trackPublications.forEach((pub) => {
    const track = pub.track
    if (track?.kind === Track.Kind.Video && track.sender) {
      senders.push(track.sender)
    }
  })

  for (const sender of senders) {
    const params = sender.getParameters()
    if (!params.encodings || params.encodings.length === 0) continue

    if (kbps === null) {
      const original = savedEncodings.get(sender)
      params.encodings.forEach((encoding, i) => {
        encoding.maxBitrate = original?.[i]
      })
      savedEncodings.delete(sender)
    } else {
      if (!savedEncodings.has(sender)) {
        savedEncodings.set(
          sender,
          params.encodings.map((encoding) => encoding.maxBitrate)
        )
      }
      const activeCount =
        params.encodings.filter((encoding) => encoding.active !== false)
          .length || 1
      // Split the budget across active simulcast layers / SVC encoding.
      const perEncoding = Math.max(
        30_000,
        Math.floor((kbps * 1000) / activeCount)
      )
      params.encodings.forEach((encoding) => {
        encoding.maxBitrate = perEncoding
      })
    }

    try {
      await sender.setParameters(params)
    } catch (e) {
      console.warn('[MeetDevtools] setParameters failed', e)
    }
  }
}

export const setDownlinkCap = (
  room: Room,
  kbps: number | null
): Promise<void> =>
  room.simulateScenario('subscriber-bandwidth', kbps === null ? 0 : kbps * 1000)

export type Scenario = {
  id: string
  label: string
  /** where the simulation happens */
  side: 'client' | 'server'
  run: (room: Room) => Promise<void>
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'resume',
    label: 'reconnect (resume)',
    side: 'client',
    // Replays a signaling WebSocket loss; media keeps flowing, client resumes.
    run: (room) => room.simulateScenario('signal-reconnect'),
  },
  {
    id: 'resume-fail',
    label: 'reconnect (resume fails)',
    side: 'client',
    // Same, but the next resume attempt fails → exercises the retry ladder.
    run: (room) => room.simulateScenario('resume-reconnect'),
  },
  {
    id: 'full-reconnect',
    label: 'full reconnect',
    side: 'client',
    // Complete rejoin with brand-new peer connections.
    run: (room) => room.simulateScenario('full-reconnect'),
  },
  {
    id: 'migration',
    label: 'server migration',
    side: 'server',
    run: (room) => room.simulateScenario('migration'),
  },
  {
    id: 'node-failure',
    label: 'SFU node failure',
    side: 'server',
    run: (room) => room.simulateScenario('node-failure'),
  },
  {
    id: 'server-leave',
    label: 'server disconnect',
    side: 'server',
    // Server-initiated leave: the closest thing to "you got kicked".
    run: (room) => room.simulateScenario('server-leave'),
  },
]

export type TransportMode =
  | 'auto'
  | 'tcp'
  | 'turn-udp'
  | 'turn-tcp'
  | 'turn-tls'

const clearServerTransportPreference = (room: Room): Promise<void> =>
  room.engine.client.sendSimulateScenario(
    new SimulateScenario({
      scenario: { case: 'switchCandidateProtocol', value: 0 },
    })
  )

const setRelayOnly = (room: Room, relay: boolean) => {
  room.engine.rtcConfig = {
    ...room.engine.rtcConfig,
    iceTransportPolicy: relay ? 'relay' : 'all',
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

export const forceTransport = async (
  room: Room,
  mode: 'tcp' | 'turn-udp' | 'turn-tcp' | 'turn-tls'
): Promise<void> => {
  if (mode === 'turn-udp') {
    await clearServerTransportPreference(room)
    setRelayOnly(room, true)
    await settle()
    return room.simulateScenario('full-reconnect')
  }
  setRelayOnly(room, false)
  return room.simulateScenario(mode === 'turn-tls' ? 'force-tls' : 'force-tcp')
}

export const releaseForcedTransport = async (room: Room): Promise<void> => {
  setRelayOnly(room, false)
  await clearServerTransportPreference(room)
  await settle()
  await room.simulateScenario('full-reconnect')
}

export const transportModeFromRoute = (route?: {
  protocol?: string
  relayProtocol?: string
}): TransportMode => {
  // relayProtocol is the client→TURN leg; protocol alone means no relay.
  if (route?.relayProtocol === 'tls') return 'turn-tls'
  if (route?.relayProtocol === 'tcp') return 'turn-tcp'
  if (route?.relayProtocol === 'udp') return 'turn-udp'
  if (route?.protocol === 'tcp') return 'tcp'
  return 'auto'
}
