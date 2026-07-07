import { useCallback, useEffect, useMemo, useRef } from 'react'
import { proxy, useSnapshot } from 'valtio'
import {
  RoomEvent,
  type Participant,
  type RemoteParticipant,
} from 'livekit-client'
import { useRoomContext } from '@livekit/components-react'

/**
 * Generic peer-to-peer broadcast over LiveKit participant data: propagate a small
 * JSON state to every participant with no server. `publishData` rides the
 * per-participant `canPublishData` grant, not the room-admin secret, so a
 * frontend-only plugin can drive shared all-participants state.
 *
 * Durability (LiveKit does not replay data messages to joiners): the producer
 * heartbeats every {@link HEARTBEAT_MS} and resyncs targeted state on join;
 * subscribers evict a peer after {@link TTL_MS}, an explicit clear, or disconnect.
 */
const HEARTBEAT_MS = 4000
const TTL_MS = 11000 // ~2.75 heartbeats: survives a couple of dropped beats

interface Envelope {
  ns: string
  /** `null` is an explicit tombstone (stop producing). */
  v: unknown
}

/**
 * One channel per namespace. `store` (reactive) holds only the payloads, so its
 * snapshot identity changes only on a real payload change; `seen` (non-reactive)
 * tracks liveness for TTL eviction, so heartbeats never churn the snapshot.
 */
interface Channel {
  store: { peers: Record<string, unknown> }
  seen: Map<string, number>
}
const channels = new Map<string, Channel>()
const channelFor = (ns: string): Channel => {
  let c = channels.get(ns)
  if (!c) {
    c = {
      store: proxy<{ peers: Record<string, unknown> }>({ peers: {} }),
      seen: new Map(),
    }
    channels.set(ns, c)
  }
  return c
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const encode = (env: Envelope): Uint8Array =>
  textEncoder.encode(JSON.stringify(env))
const decode = (data: Uint8Array): Envelope | null => {
  try {
    return JSON.parse(textDecoder.decode(data)) as Envelope
  } catch {
    return null
  }
}

/** Refresh liveness always; write the reactive store only when the payload changed. */
const setPeer = (ch: Channel, id: string, payload: unknown): void => {
  ch.seen.set(id, Date.now())
  const prev = ch.store.peers[id]
  if (prev === undefined || JSON.stringify(prev) !== JSON.stringify(payload)) {
    ch.store.peers[id] = payload
  }
}
const dropPeer = (ch: Channel, id: string): void => {
  ch.seen.delete(id)
  delete ch.store.peers[id]
}

export interface Broadcast<T> {
  /** Set THIS client's produced state for the namespace; `null` clears it. */
  publish: (payload: T | null) => void
  /** Current live states keyed by producer identity (includes self while producing). */
  peers: Record<string, T>
}

/** Subscribe to and produce a namespaced peer-broadcast; `peers` is reactive. */
export function useBroadcast<T = unknown>(namespace: string): Broadcast<T> {
  const room = useRoomContext()
  const ch = channelFor(namespace)
  const snap = useSnapshot(ch.store)
  const selfRef = useRef<T | null>(null)

  useEffect(() => {
    if (!room) return

    const onData = (data: Uint8Array, participant?: Participant) => {
      const env = decode(data)
      if (!env || env.ns !== namespace || !participant) return
      if (env.v === null) dropPeer(ch, participant.identity)
      else setPeer(ch, participant.identity, env.v)
    }
    const onJoin = (p: RemoteParticipant) => {
      if (selfRef.current != null) {
        room.localParticipant
          .publishData(encode({ ns: namespace, v: selfRef.current }), {
            reliable: true,
            destinationIdentities: [p.identity],
          })
          .catch(() => {})
      }
    }
    const onLeave = (p: RemoteParticipant) => dropPeer(ch, p.identity)
    // Stores are module-level: drop the whole room's state on disconnect so a
    // meeting joined later in the same tab never sees the previous one's peers.
    const onDisconnect = () => {
      ch.seen.clear()
      ch.store.peers = {}
    }

    room.on(RoomEvent.DataReceived, onData)
    room.on(RoomEvent.ParticipantConnected, onJoin)
    room.on(RoomEvent.ParticipantDisconnected, onLeave)
    room.on(RoomEvent.Disconnected, onDisconnect)

    const hb = setInterval(() => {
      if (selfRef.current != null) {
        room.localParticipant
          .publishData(encode({ ns: namespace, v: selfRef.current }), {
            reliable: true,
          })
          .catch(() => {})
      }
      const now = Date.now()
      for (const [id, ts] of ch.seen) {
        if (now - ts > TTL_MS) dropPeer(ch, id)
      }
    }, HEARTBEAT_MS)

    return () => {
      room.off(RoomEvent.DataReceived, onData)
      room.off(RoomEvent.ParticipantConnected, onJoin)
      room.off(RoomEvent.ParticipantDisconnected, onLeave)
      room.off(RoomEvent.Disconnected, onDisconnect)
      clearInterval(hb)
    }
  }, [room, namespace, ch])

  const publish = useCallback(
    (payload: T | null) => {
      selfRef.current = payload
      // Write self into the SHARED store so every consumer of the namespace in
      // this tab sees one consistent view — not just this hook instance.
      if (room) {
        const id = room.localParticipant.identity
        if (payload === null) dropPeer(ch, id)
        else setPeer(ch, id, payload)
      }
      room?.localParticipant
        .publishData(encode({ ns: namespace, v: payload }), { reliable: true })
        .catch(() => {})
    },
    [room, namespace, ch]
  )

  const peers = useMemo(() => {
    const out: Record<string, T> = {}
    for (const [id, payload] of Object.entries(snap.peers)) out[id] = payload as T
    return out
  }, [snap])

  return { publish, peers }
}
