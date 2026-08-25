import { Checker, Track, type CheckInfo } from 'livekit-client'

/**
 * Addresses are useful to a network administrator (they identify the egress IP
 * and the SFU endpoint actually reached) but they also land in a downloadable
 * report. Flip this to false to keep only the candidate types and protocols.
 */
const INCLUDE_CANDIDATE_ADDRESSES = true

/** Beyond this, the log becomes noise rather than evidence. */
const MAX_LOGGED_PAIRS = 8

export type IceCandidateInfo = {
  /** host, srflx, prflx or relay. */
  type?: string
  /** Transport to the first hop: udp or tcp. */
  protocol?: string
  /** Transport used by the relay itself (udp, tcp, tls). Local relay only. */
  relayProtocol?: string
  /** Chrome reports an mDNS `.local` name here for host candidates. */
  address?: string
  port?: number
  /** Local candidates only, and not reported by every browser. */
  networkType?: string
}

export type IceCandidatePair = {
  /** The pair the browser is actually sending media on. */
  selected: boolean
  nominated?: boolean
  local: IceCandidateInfo
  remote: IceCandidateInfo
  /** Round trip time in milliseconds. */
  rttMs?: number
  availableOutgoingBitrate?: number
  bytesSent?: number
}

export type IceCandidateReport = {
  selected: IceCandidatePair | null
  /** Every pair that completed its connectivity checks, selected one first. */
  working: IceCandidatePair[]
}

/**
 * True when the selected pair does not carry media over plain UDP: the browser
 * fell back to a TURN relay over TCP or TLS, or even the direct route is not
 * UDP. Media still flows, but quality usually degrades under load.
 *
 * Accepts the loosely typed `data` stored on the step result; anything that is
 * not an IceCandidateReport simply yields false.
 */
export const isSuboptimalRoute = (data: unknown): boolean => {
  const selected = (data as IceCandidateReport | null | undefined)?.selected
  if (!selected) return false
  const transport = selected.local.relayProtocol ?? selected.local.protocol
  // An unreported transport is not evidence of a bad route.
  if (!transport) return false
  return transport.toLowerCase() !== 'udp'
}

const PROBE_WIDTH = 320
const PROBE_HEIGHT = 180
const PROBE_FPS = 15
const SETTLE_DELAY_MS = 3000

type Stats = Record<string, unknown> & { type?: string }

const readCandidate = (stats?: Stats): IceCandidateInfo => {
  if (!stats) return {}

  return {
    type: stats.candidateType as string | undefined,
    protocol: stats.protocol as string | undefined,
    relayProtocol: stats.relayProtocol as string | undefined,
    networkType: stats.networkType as string | undefined,
    ...(INCLUDE_CANDIDATE_ADDRESSES
      ? {
          address: stats.address as string | undefined,
          port: stats.port as number | undefined,
        }
      : {}),
  }
}

const describeCandidate = (candidate: IceCandidateInfo) => {
  const transport = candidate.relayProtocol ?? candidate.protocol ?? 'unknown'
  const endpoint =
    candidate.address === undefined
      ? ''
      : ` ${candidate.address}:${candidate.port ?? '?'}`
  return `${candidate.type ?? 'unknown'} ${transport}${endpoint}`
}

const parseCandidates = (report: RTCStatsReport): IceCandidateReport => {
  let selectedId: string | undefined

  report.forEach((stats: Stats) => {
    if (stats.type === 'transport' && stats.selectedCandidatePairId) {
      selectedId = stats.selectedCandidatePairId as string
    }
  })

  const working: IceCandidatePair[] = []

  report.forEach((stats: Stats) => {
    // `succeeded` means the pair completed its connectivity checks; failed,
    // waiting and in-progress pairs are not evidence of anything working.
    if (stats.type !== 'candidate-pair' || stats.state !== 'succeeded') return

    const rtt = stats.currentRoundTripTime as number | undefined

    working.push({
      selected: selectedId !== undefined && stats.id === selectedId,
      nominated: stats.nominated as boolean | undefined,
      local: readCandidate(report.get(stats.localCandidateId as string)),
      remote: readCandidate(report.get(stats.remoteCandidateId as string)),
      rttMs: rtt === undefined ? undefined : Math.round(rtt * 1000),
      availableOutgoingBitrate: stats.availableOutgoingBitrate as
        | number
        | undefined,
      bytesSent: stats.bytesSent as number | undefined,
    })
  })

  // Firefox does not report transport.selectedCandidatePairId: fall back to the
  // nominated pair, then to the one that actually carried bytes.
  let selected = working.find((pair) => pair.selected) ?? null
  if (!selected) {
    selected =
      working.find((pair) => pair.nominated) ??
      working
        .slice()
        .sort((a, b) => (b.bytesSent ?? 0) - (a.bytesSent ?? 0))[0] ??
      null
    if (selected) selected.selected = true
  }

  working.sort((a, b) => Number(b.selected) - Number(a.selected))

  return { selected, working }
}

/**
 * A synthetic track avoids asking for camera or microphone permission: this
 * check must work for someone who denied both.
 */
const createProbeTrack = () => {
  const canvas = document.createElement('canvas')
  canvas.width = PROBE_WIDTH
  canvas.height = PROBE_HEIGHT

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not get canvas context')

  let frame = 0
  let rafId = 0
  const draw = () => {
    frame = (frame + 4) % 360
    context.fillStyle = `hsl(${frame}, 100%, 50%)`
    context.fillRect(0, 0, canvas.width, canvas.height)
    rafId = requestAnimationFrame(draw)
  }
  draw()

  const track = canvas.captureStream(PROBE_FPS).getVideoTracks()[0]

  return {
    track,
    stop: () => {
      cancelAnimationFrame(rafId)
      track.stop()
    },
  }
}

export class SelectedCandidateCheck extends Checker {
  private result: IceCandidateReport | null = null

  get description() {
    const selected = this.result?.selected
    if (!selected) return 'Selected ICE candidate pair'

    const transport =
      selected.local.relayProtocol ?? selected.local.protocol ?? 'unknown'
    const rtt =
      selected.rttMs === undefined ? '' : ` · RTT ${selected.rttMs} ms`
    return `${selected.local.type ?? 'unknown'} over ${transport}${rtt}`
  }

  protected async perform() {
    await this.connect()

    const probe = createProbeTrack()
    try {
      let publication
      try {
        publication = await this.room.localParticipant.publishTrack(
          probe.track,
          {
            // The token restricts `can_publish_sources`, so a raw
            // MediaStreamTrack published as `unknown` is rejected server side.
            source: Track.Source.Camera,
            simulcast: false,
            videoEncoding: { maxBitrate: 300_000, maxFramerate: PROBE_FPS },
          }
        )
      } catch (error) {
        // A server-side grant problem is not a diagnosis of the user's network.
        this.appendWarning(
          `Could not publish the probe track: ${
            error instanceof Error ? error.message : 'unknown error'
          }`
        )
        this.skip()
        return
      }

      // ICE keeps promoting pairs for a moment after the track goes up.
      await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS))

      // Stats come from the publisher peer connection: in an empty test room
      // there is no subscriber transport to inspect.
      const report = await publication.track?.getRTCStatsReport()
      this.result = report ? parseCandidates(report) : null
    } finally {
      probe.stop()
    }

    const selected = this.result?.selected
    const working = this.result?.working ?? []

    if (!selected) {
      this.appendWarning('No working candidate pair reported by the browser')
      return
    }

    this.appendMessage(`selected: ${describeCandidate(selected.local)}`)
    this.appendMessage(`server: ${describeCandidate(selected.remote)}`)
    if (selected.rttMs !== undefined) {
      this.appendMessage(`round trip time: ${selected.rttMs} ms`)
    }

    this.appendMessage(`working candidate pairs: ${working.length}`)
    for (const pair of working.slice(0, MAX_LOGGED_PAIRS)) {
      const rtt = pair.rttMs === undefined ? '' : ` · ${pair.rttMs} ms`
      this.appendMessage(
        `${pair.selected ? '→' : ' '} ${describeCandidate(pair.local)} → ${describeCandidate(pair.remote)}${rtt}`
      )
    }
    if (working.length > MAX_LOGGED_PAIRS) {
      this.appendMessage(
        `… and ${working.length - MAX_LOGGED_PAIRS} more, see the report`
      )
    }

    if (selected.local.type === 'relay') {
      this.appendWarning(
        'Media is relayed through TURN. Direct connections are likely blocked by a firewall.'
      )
    }
    if ((selected.local.relayProtocol ?? selected.local.protocol) !== 'udp') {
      this.appendWarning(
        'Media is not using UDP, which usually means degraded quality under load.'
      )
    }
  }

  getInfo(): CheckInfo {
    const info = super.getInfo()
    info.data = this.result ?? undefined
    return info
  }
}
