import { useEffect, useRef, useState } from 'react'
import { Room } from 'livekit-client'

export type TrackRow = {
  key: string
  dir: 'up' | 'down'
  label: string
  codec?: string
  kbps: number
  fps?: number
  res?: string
}

export type StatsSnapshot = {
  ts: number
  /** wire totals from transport stats (includes headers, RTCP, FEC) */
  upKbps: number
  downKbps: number
  rttMs?: number
  /** worst inbound RTP jitter across subscribed tracks */
  jitterMs?: number
  availableOutKbps?: number
  /** selected ICE route of the publisher transport (measured, not assumed) */
  route?: { protocol?: string; type?: string; relayProtocol?: string }
  /**
   * relayProtocol values of gathered relay local candidates — i.e. which
   * client→TURN transports are actually configured (udp/tcp/tls). Empty
   * when no TURN server is configured.
   */
  turnProtocols: string[]
  tracks: TrackRow[]
}

type StatDict = Record<string, unknown>
type Counters = Record<string, number>

const asNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

const asString = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined

const shortCodec = (mimeType?: string) =>
  mimeType ? mimeType.replace(/^(audio|video)\//, '') : undefined

const buildTrackLabels = (room: Room) => {
  const labels = new Map<string, string>()
  room.localParticipant.trackPublications.forEach((pub) => {
    const id = pub.track?.mediaStreamTrack?.id
    if (id) labels.set(id, `local ${pub.source}`)
  })
  room.remoteParticipants.forEach((participant) => {
    // Keep rows scannable: participant names capped at 10 chars.
    const rawName = participant.name || participant.identity
    const name = rawName.length > 10 ? `${rawName.slice(0, 10)}.` : rawName
    participant.trackPublications.forEach((pub) => {
      const id = pub.track?.mediaStreamTrack?.id
      if (id) labels.set(id, `${name} ${pub.source}`)
    })
  })
  return labels
}

export const useWebRTCStats = (
  room: Room,
  enabled: boolean,
  intervalMs = 1000
) => {
  // Single source of truth: the snapshot is just the last history entry.
  const [history, setHistory] = useState<StatsSnapshot[]>([])
  const prevRef = useRef(new Map<string, Counters>())

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const prev = prevRef.current

    /** Per-stat counter deltas; returns 0 on the first sighting. */
    const deltas = (key: string, now: Counters): Counters => {
      const before = prev.get(key)
      prev.set(key, now)
      const out: Counters = {}
      for (const [name, value] of Object.entries(now)) {
        out[name] = before?.[name] !== undefined ? value - before[name] : 0
      }
      return out
    }

    const collect = async () => {
      const reports: Array<{ pc: 'pub' | 'sub'; report: RTCStatsReport }> = []
      try {
        // Not public API — see file header.
        const manager = room.engine?.pcManager
        const pub = await manager?.publisher?.getStats()
        if (pub) reports.push({ pc: 'pub', report: pub })
        const sub = await manager?.subscriber?.getStats()
        if (sub) reports.push({ pc: 'sub', report: sub })
      } catch {
        // Engine not ready or SDK internals changed; panel shows nothing.
      }
      if (cancelled || reports.length === 0) return

      const labels = buildTrackLabels(room)
      const tracks: TrackRow[] = []
      let upKbps = 0
      let downKbps = 0
      let rttMs: number | undefined
      let jitterMs: number | undefined
      let availableOutKbps: number | undefined
      let route: StatsSnapshot['route']
      const turnProtocols = new Set<string>()

      for (const { pc, report } of reports) {
        const byId = new Map<string, StatDict>()
        report.forEach((stat) => byId.set(stat.id as string, stat as StatDict))

        report.forEach((raw) => {
          const stat = raw as StatDict
          const type = asString(stat.type)
          const ts = asNumber(stat.timestamp) ?? Date.now()
          const key = `${pc}:${asString(stat.id) ?? ''}`

          if (
            type === 'local-candidate' &&
            asString(stat.candidateType) === 'relay'
          ) {
            // Relay candidates are only gathered when a TURN server is
            // configured and reachable; relayProtocol says how the client
            // reaches it (udp/tcp/tls).
            turnProtocols.add(
              asString(stat.relayProtocol) ?? asString(stat.protocol) ?? 'udp'
            )
          }

          if (type === 'transport') {
            const d = deltas(key, {
              sent: asNumber(stat.bytesSent) ?? 0,
              received: asNumber(stat.bytesReceived) ?? 0,
              ts,
            })
            if (d.ts > 0) {
              upKbps += Math.max(0, (d.sent * 8) / d.ts)
              downKbps += Math.max(0, (d.received * 8) / d.ts)
            }
          }

          if (type === 'candidate-pair' && stat.nominated === true) {
            const rtt = asNumber(stat.currentRoundTripTime)
            if (rtt !== undefined) rttMs = Math.round(rtt * 1000)
            const available = asNumber(stat.availableOutgoingBitrate)
            if (available !== undefined && pc === 'pub') {
              availableOutKbps = Math.round(available / 1000)
            }
            if (pc === 'pub') {
              const local = byId.get(asString(stat.localCandidateId) ?? '')
              route = {
                protocol: asString(local?.protocol),
                type: asString(local?.candidateType),
                relayProtocol: asString(local?.relayProtocol),
              }
            }
          }

          if (type === 'outbound-rtp' || type === 'inbound-rtp') {
            const isUp = type === 'outbound-rtp'

            if (!isUp) {
              const jitter = asNumber(stat.jitter)
              if (jitter !== undefined) {
                const ms = Math.round(jitter * 1000)
                if (jitterMs === undefined || ms > jitterMs) jitterMs = ms
              }
            }

            const d = deltas(key, {
              bytes: asNumber(isUp ? stat.bytesSent : stat.bytesReceived) ?? 0,
              ts,
            })
            const kbps = d.ts > 0 ? Math.max(0, (d.bytes * 8) / d.ts) : 0

            // Resolve codec + source track.
            const codecStat = byId.get(asString(stat.codecId) ?? '')
            let msTrackId = asString(stat.trackIdentifier)
            if (!msTrackId && isUp) {
              const mediaSource = byId.get(asString(stat.mediaSourceId) ?? '')
              msTrackId = asString(mediaSource?.trackIdentifier)
            }
            const rid = asString(stat.rid)
            const baseLabel =
              (msTrackId && labels.get(msTrackId)) ??
              `${asString(stat.kind) ?? 'media'} ssrc ${asNumber(stat.ssrc) ?? '?'}`

            const width = asNumber(stat.frameWidth)
            const height = asNumber(stat.frameHeight)

            tracks.push({
              key,
              dir: isUp ? 'up' : 'down',
              label: rid ? `${baseLabel} [${rid}]` : baseLabel,
              codec: shortCodec(asString(codecStat?.mimeType)),
              kbps,
              fps: asNumber(stat.framesPerSecond),
              res: width && height ? `${width}x${height}` : undefined,
            })
          }
        })
      }

      // Stable order (direction, then label): sorting by bitrate would
      // reshuffle rows on every tick as kbps fluctuates.
      tracks.sort((a, b) =>
        a.dir === b.dir
          ? a.label.localeCompare(b.label)
          : a.dir === 'up'
            ? -1
            : 1
      )

      const next: StatsSnapshot = {
        ts: Date.now(),
        upKbps: Math.round(upKbps),
        downKbps: Math.round(downKbps),
        rttMs,
        jitterMs,
        availableOutKbps,
        route,
        turnProtocols: Array.from(turnProtocols).sort(),
        tracks,
      }
      setHistory((h) => [...h.slice(-59), next])
    }

    void collect()
    const id = window.setInterval(() => void collect(), intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [room, enabled, intervalMs])

  return { snapshot: history[history.length - 1], history }
}
