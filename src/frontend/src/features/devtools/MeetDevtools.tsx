import { CSSProperties, useState } from 'react'
import { useConnectionState, useRoomContext } from '@livekit/components-react'
import { ConnectionState } from 'livekit-client'
import { StatsSnapshot, TrackRow, useWebRTCStats } from './useWebRTCStats'
import { readRoomConfig } from './roomConfig'
import {
  forceTransport,
  releaseForcedTransport,
  Scenario,
  SCENARIOS,
  setDownlinkCap,
  setUplinkCap,
  stepBitrate,
  TransportMode,
  transportModeFromRoute,
} from './simulation'

const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

const COLOR = {
  text: '#e8e8e8',
  muted: '#9a9a9a',
  faint: '#6f6f6f',
  hairline: '#2c2d31',
  border: '#3d3e44',
  surface: '#1b1c1e',
  chartBg: '#141517',
  down: '#f6821f',
  up: '#5a9cf8',
  ok: '#10b981',
  bad: '#f05a4a',
  busy: '#e5a13c',
}

const stateColor = (state: ConnectionState): string => {
  switch (state) {
    case ConnectionState.Connected:
      return COLOR.ok
    case ConnectionState.Reconnecting:
    case ConnectionState.SignalReconnecting:
      return COLOR.busy
    case ConnectionState.Connecting:
      return COLOR.up
    case ConnectionState.Disconnected:
      return COLOR.bad
  }
}

const styles: Record<string, CSSProperties> = {
  toggle: {
    position: 'fixed',
    bottom: 12,
    right: 12,
    zIndex: 9999,
    fontFamily: SANS,
    fontSize: 12,
    lineHeight: 1,
    padding: '8px 12px',
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: COLOR.border,
    background: COLOR.surface,
    color: COLOR.text,
    cursor: 'pointer',
    boxShadow: '0 2px 10px #0006',
  },
  panel: {
    position: 'fixed',
    bottom: 12,
    right: 12,
    zIndex: 9999,
    width: 460,
    maxWidth: 'calc(100vw - 24px)',
    maxHeight: 'calc(100vh - 24px)',
    overflowY: 'auto',
    fontFamily: SANS,
    fontSize: 11,
    lineHeight: 1.5,
    color: COLOR.text,
    background: COLOR.surface,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: COLOR.border,
    borderRadius: 10,
    padding: 14,
    boxShadow: '0 10px 34px #00000080',
  },
  sectionTitle: {
    margin: '14px 0 5px',
    color: COLOR.faint,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 9,
    fontWeight: 600,
    display: 'flex',
    justifyContent: 'space-between',
  },
  metricsLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    margin: '0 0 10px',
    paddingBottom: 10,
    borderBottom: `1px solid ${COLOR.hairline}`,
    fontVariantNumeric: 'tabular-nums',
  },
  legend: {
    display: 'flex',
    gap: 12,
    marginTop: 3,
    color: COLOR.faint,
    fontSize: 10,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  configList: { display: 'flex', flexWrap: 'wrap' },
  configRow: {
    display: 'flex',
    gap: 6,
    flex: '0 0 50%',
    minWidth: 0,
    boxSizing: 'border-box',
    padding: '1px 8px 1px 0',
  },
  configLabel: {
    color: COLOR.muted,
    flex: '0 0 45%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  configValue: {
    flex: 1,
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  trackRow: {
    display: 'flex',
    gap: 8,
    padding: '3px 0',
    borderBottom: `1px solid ${COLOR.hairline}`,
    alignItems: 'baseline',
  },
  trackLabel: {
    flex: '0 0 34%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  trackCodec: {
    flex: '0 0 11%',
    fontFamily: MONO,
    fontSize: 10,
    color: COLOR.muted,
  },
  trackKbps: {
    flex: '0 0 9%',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  trackDetail: {
    flex: 1,
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  mono: { fontFamily: MONO, fontSize: 10, color: COLOR.muted },
  button: {
    fontFamily: SANS,
    fontSize: 11,
    padding: '3px 9px',
    borderRadius: 5,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: COLOR.border,
    background: '#232428',
    color: COLOR.text,
    cursor: 'pointer',
  },
  buttonActive: { borderColor: COLOR.down, color: COLOR.down },
  buttonDisabled: { color: COLOR.faint, cursor: 'not-allowed' },
  row: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  stepperValue: {
    minWidth: 92,
    textAlign: 'center',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: COLOR.hairline,
    borderRadius: 4,
    padding: '2px 6px',
    background: COLOR.chartBg,
    fontVariantNumeric: 'tabular-nums',
  },
  close: {
    background: 'none',
    border: 'none',
    color: COLOR.faint,
    cursor: 'pointer',
    fontSize: 14,
  },
}

const Sparkline = ({ history }: { history: StatsSnapshot[] }) => {
  const width = 430
  const height = 54
  const max = Math.max(...history.map((s) => Math.max(s.upKbps, s.downKbps)), 1)
  const points = (pick: (s: StatsSnapshot) => number) =>
    history
      .map(
        (s, i) =>
          `${((i / Math.max(history.length - 1, 1)) * width).toFixed(1)},${(
            height -
            (pick(s) / max) * (height - 6) -
            3
          ).toFixed(1)}`
      )
      .join(' ')
  return (
    <>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Bandwidth over the last minute"
        style={{
          display: 'block',
          background: COLOR.chartBg,
          borderRadius: 6,
          border: `1px solid ${COLOR.hairline}`,
        }}
      >
        {history.length >= 2 && (
          <>
            <polyline
              points={points((s) => s.downKbps)}
              fill="none"
              stroke={COLOR.down}
              strokeWidth="1.5"
            />
            <polyline
              points={points((s) => s.upKbps)}
              fill="none"
              stroke={COLOR.up}
              strokeWidth="1.5"
            />
          </>
        )}
      </svg>
      {/* Legend outside the plot: text over the lines was unreadable. */}
      <div style={styles.legend}>
        <span>
          <span style={{ color: COLOR.down }}>●</span> down
        </span>
        <span>
          <span style={{ color: COLOR.up }}>●</span> up
        </span>
        <span>last 60s · max {Math.round(max)} kbps</span>
      </div>
    </>
  )
}

const CapStepper = ({
  label,
  hint,
  valueKbps,
  onChange,
}: {
  label: string
  hint: string
  valueKbps: number | null
  onChange: (kbps: number | null) => void
}) => (
  <div style={styles.row}>
    <span style={{ flex: '0 0 70px' }}>{label}</span>
    <button
      type="button"
      style={styles.button}
      aria-label={`Decrease ${label} bandwidth`}
      onClick={() => onChange(stepBitrate(valueKbps, 'decrease'))}
    >
      −
    </button>
    <span
      style={{
        ...styles.stepperValue,
        ...(valueKbps !== null ? { color: COLOR.down } : {}),
      }}
    >
      {valueKbps === null ? 'unlimited' : `≤ ${valueKbps} kbps`}
    </span>
    <button
      type="button"
      style={styles.button}
      aria-label={`Increase ${label} bandwidth`}
      onClick={() => onChange(stepBitrate(valueKbps, 'increase'))}
    >
      +
    </button>
    <span style={styles.mono}>{hint}</span>
  </div>
)

const TrackList = ({ title, rows }: { title: string; rows: TrackRow[] }) => (
  <>
    <div style={styles.sectionTitle}>
      <span>
        {title} ({rows.length})
      </span>
      <span>
        {Math.round(rows.reduce((sum, t) => sum + t.kbps, 0))} kbps media
      </span>
    </div>
    <div style={styles.list}>
      {rows.map((track) => (
        <div key={track.key} style={styles.trackRow}>
          <span style={styles.trackLabel}>{track.label}</span>
          <span style={styles.trackCodec}>{track.codec ?? '–'}</span>
          <span style={styles.trackKbps}>{Math.round(track.kbps)}</span>
          <span style={styles.trackDetail}>
            {[
              track.res,
              track.fps !== undefined && `${Math.round(track.fps)}fps`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      ))}
      {rows.length === 0 && <span style={{ color: COLOR.faint }}>none</span>}
    </div>
  </>
)

const MeetDevtools = () => {
  const room = useRoomContext()
  const connState = useConnectionState(room)
  const [open, setOpen] = useState(false)
  const [firedScenario, setFiredScenario] = useState<string>()
  const [uplinkCap, setUplinkCapState] = useState<number | null>(null)
  const [downlinkCap, setDownlinkCapState] = useState<number | null>(null)
  const { snapshot, history } = useWebRTCStats(room, open)

  const transportMode: TransportMode = transportModeFromRoute(snapshot?.route)

  const fireScenario = (scenario: Scenario) => {
    setFiredScenario(scenario.id)
    scenario.run(room).catch((e) => {
      console.warn('[MeetDevtools] simulateScenario failed', e)
    })
    window.setTimeout(
      () =>
        setFiredScenario((current) =>
          current === scenario.id ? undefined : current
        ),
      1200
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        style={styles.toggle}
        onClick={() => setOpen(true)}
        aria-label="Open WebRTC devtools"
      >
        <span style={{ color: stateColor(connState) }}>●</span> rtc
      </button>
    )
  }

  const config = readRoomConfig(room)
  const published = snapshot?.tracks.filter((t) => t.dir === 'up') ?? []
  const subscribed = snapshot?.tracks.filter((t) => t.dir === 'down') ?? []
  const turnProtocols = snapshot?.turnProtocols ?? []
  const transports: Array<{
    mode: TransportMode
    label: string
    requires?: string
    title: string
  }> = [
    {
      mode: 'auto',
      label: 'auto (udp)',
      title:
        'clears the server-cached transport preference and relay-only policy, then full reconnect',
    },
    {
      mode: 'tcp',
      label: 'tcp',
      title: 'force-tcp — server prefers TCP candidates (ICE/TCP)',
    },
    {
      mode: 'turn-udp',
      label: 'turn:udp',
      requires: 'udp',
      title:
        'client-side: iceTransportPolicy relay + full reconnect (no server hook exists)',
    },
    {
      mode: 'turn-tcp',
      label: 'turn:tcp',
      requires: 'tcp',
      title: 'force-tcp — lands on TURN/TCP when it is the TCP path',
    },
    {
      mode: 'turn-tls',
      label: 'turn:tls',
      requires: 'tls',
      title: 'force-tls — server switches you to TURN over TLS',
    },
  ]

  return (
    <section style={styles.panel} aria-label="WebRTC devtools">
      <div style={styles.metricsLine}>
        <span>
          <span style={{ color: COLOR.down }}>↓</span> {snapshot?.downKbps ?? 0}{' '}
          kbps
        </span>
        <span>
          <span style={{ color: COLOR.up }}>↑</span> {snapshot?.upKbps ?? 0}{' '}
          kbps
        </span>
        <span style={{ color: COLOR.muted }}>
          rtt{' '}
          <span style={{ color: COLOR.text }}>{snapshot?.rttMs ?? '–'}</span> ms
        </span>
        <span style={{ color: COLOR.muted }}>
          jitter{' '}
          <span style={{ color: COLOR.text }}>{snapshot?.jitterMs ?? '–'}</span>{' '}
          ms
        </span>
        <span
          style={{
            color: stateColor(connState),
            fontSize: 10,
            marginLeft: 'auto',
          }}
        >
          ● {connState}
        </span>
        <button
          type="button"
          style={styles.close}
          onClick={() => setOpen(false)}
          aria-label="Close WebRTC devtools"
        >
          ✕
        </button>
      </div>

      <Sparkline history={history} />

      <div style={styles.sectionTitle}>room configuration (live)</div>
      <div style={styles.configList}>
        {config.map((entry) => (
          <div key={entry.label} style={styles.configRow}>
            <span
              style={{
                color:
                  entry.on === undefined
                    ? COLOR.faint
                    : entry.on
                      ? COLOR.ok
                      : COLOR.bad,
              }}
            >
              ●
            </span>
            <span style={styles.configLabel}>{entry.label}</span>
            <span style={styles.configValue} title={entry.value}>
              {entry.value}
            </span>
          </div>
        ))}
      </div>

      <TrackList title="published ↑" rows={published} />
      <TrackList title="subscribed ↓" rows={subscribed} />

      <div style={styles.sectionTitle}>bandwidth</div>
      <div style={{ ...styles.list, gap: 4 }}>
        <CapStepper
          label="uplink"
          hint="encoder cap (setParameters)"
          valueKbps={uplinkCap}
          onChange={(kbps) => {
            setUplinkCapState(kbps)
            void setUplinkCap(room, kbps)
          }}
        />
        <CapStepper
          label="downlink"
          hint="SFU limit (subscriber-bandwidth)"
          valueKbps={downlinkCap}
          onChange={(kbps) => {
            setDownlinkCapState(kbps)
            void setDownlinkCap(room, kbps).catch((e) =>
              console.warn('[MeetDevtools] downlink cap failed', e)
            )
          }}
        />
      </div>

      <div style={styles.sectionTitle}>transport</div>
      <div style={styles.row}>
        {transports.map(({ mode, label, requires, title }) => {
          const available = !requires || turnProtocols.includes(requires)
          const active = transportMode === mode
          const clickable = available && !active
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={active}
              disabled={!clickable}
              title={available ? title : `${title} — not configured`}
              style={{
                ...styles.button,
                ...(clickable || active ? {} : styles.buttonDisabled),
                ...(active ? styles.buttonActive : {}),
              }}
              onClick={() => {
                if (!clickable) return
                void (
                  mode === 'auto'
                    ? releaseForcedTransport(room)
                    : forceTransport(
                        room,
                        mode as 'tcp' | 'turn-udp' | 'turn-tcp' | 'turn-tls'
                      )
                ).catch((e) =>
                  console.warn('[MeetDevtools] transport change failed', e)
                )
              }}
            >
              {requires && (
                <span style={{ color: available ? COLOR.ok : COLOR.faint }}>
                  ●{' '}
                </span>
              )}
              {label}
            </button>
          )
        })}
        <span style={styles.mono}>
          route:{' '}
          {snapshot?.route
            ? [
                snapshot.route.protocol,
                snapshot.route.type,
                snapshot.route.relayProtocol &&
                  `relay:${snapshot.route.relayProtocol}`,
              ]
                .filter(Boolean)
                .join('·')
            : '–'}
        </span>
      </div>

      <div style={styles.sectionTitle}>connection scenarios</div>
      <div style={styles.row}>
        {SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            title={`${scenario.side}-side simulation — momentary, watch the state dot`}
            style={{
              ...styles.button,
              ...(firedScenario === scenario.id ? styles.buttonActive : {}),
            }}
            onClick={() => fireScenario(scenario)}
          >
            {scenario.side === 'server' ? '☁ ' : ''}
            {scenario.label}
          </button>
        ))}
      </div>
    </section>
  )
}

export default MeetDevtools
