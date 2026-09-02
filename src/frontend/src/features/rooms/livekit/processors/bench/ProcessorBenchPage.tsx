import { useCallback, useMemo, useRef, useState } from 'react'
import { css } from '@/styled-system/css'
import { BENCH_CONTENDERS } from './contenders'
import { BenchAbortError, runBenchmark } from './ProcessorBenchmark'
import { supportsLongTasks, supportsRvfc } from './collectors'
import {
  DEFAULT_BENCH_OPTIONS,
  type BenchProgress,
  type BenchReport,
} from './types'

const RESOLUTIONS = [
  { label: '640x360', width: 640, height: 360 },
  { label: '1280x720', width: 1280, height: 720 },
  { label: '1920x1080', width: 1920, height: 1080 },
]

const styles = {
  page: css({
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    maxWidth: '1200px',
    marginX: 'auto',
  }),
  row: css({
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
    alignItems: 'flex-end',
  }),
  field: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.875rem',
  }),
  contenders: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  }),
  previews: css({
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
  }),
  // Reserves the slot while the harness swaps its video element in and out.
  videoSlot: css({
    width: '320px',
    maxWidth: '100%',
    aspectRatio: '16 / 9',
    background: '#111',
    borderRadius: '4px',
  }),
  video: css({
    width: '100%',
    height: '100%',
    borderRadius: '4px',
    objectFit: 'contain',
  }),
  tableWrap: css({
    overflowX: 'auto',
  }),
  table: css({
    borderCollapse: 'collapse',
    fontSize: '0.8125rem',
    width: '100%',
    '& th, & td': {
      border: '1px solid #ddd',
      padding: '0.375rem 0.5rem',
      textAlign: 'right',
      whiteSpace: 'nowrap',
    },
    '& th:first-child, & td:first-child': {
      textAlign: 'left',
    },
  }),
  note: css({
    fontSize: '0.8125rem',
    color: '#666',
  }),
  error: css({
    fontSize: '0.8125rem',
    color: '#b3261e',
  }),
  button: css({
    padding: '0.5rem 1rem',
    borderRadius: '4px',
    border: '1px solid #666',
    cursor: 'pointer',
    _disabled: { opacity: 0.5, cursor: 'not-allowed' },
  }),
}

const fmt = (value: number | null | undefined, digits = 1): string =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : '—'

const fmtMb = (bytes: number | null | undefined): string =>
  typeof bytes === 'number' ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '—'

const describeProgress = (progress: BenchProgress): string => {
  switch (progress.phase) {
    case 'idle':
      return 'Idle'
    case 'starting':
      return `Initialising ${progress.contenderLabel} (pass ${(progress.pass ?? 0) + 1})`
    case 'warmup':
      return `Warming up ${progress.contenderLabel} (pass ${(progress.pass ?? 0) + 1})`
    case 'measuring':
      return `Measuring ${progress.contenderLabel} (pass ${(progress.pass ?? 0) + 1})`
    case 'cooldown':
      return `Cooling down after ${progress.contenderLabel}`
    case 'done':
      return 'Done'
  }
}

const ProcessorBenchPage = () => {
  const sourceContainerRef = useRef<HTMLDivElement>(null)
  const outputContainerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [selected, setSelected] = useState<string[]>(
    BENCH_CONTENDERS.slice(0, 2).map((contender) => contender.id)
  )
  const [resolution, setResolution] = useState(RESOLUTIONS[1].label)
  const [measureSeconds, setMeasureSeconds] = useState(15)
  const [passes, setPasses] = useState(2)

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<BenchProgress>({ phase: 'idle' })
  const [report, setReport] = useState<BenchReport | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const estimatedSeconds = useMemo(() => {
    const perRun =
      DEFAULT_BENCH_OPTIONS.warmupMs / 1000 +
      measureSeconds +
      DEFAULT_BENCH_OPTIONS.cooldownMs / 1000
    return Math.round(perRun * selected.length * passes)
  }, [measureSeconds, passes, selected.length])

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )

  const start = useCallback(async () => {
    const sourceContainer = sourceContainerRef.current
    const outputContainer = outputContainerRef.current
    if (!sourceContainer || !outputContainer) return

    const chosen = BENCH_CONTENDERS.filter((contender) =>
      selected.includes(contender.id)
    )
    const size =
      RESOLUTIONS.find((item) => item.label === resolution) ?? RESOLUTIONS[1]

    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setFailure(null)
    setReport(null)

    try {
      const result = await runBenchmark(
        chosen,
        {
          ...DEFAULT_BENCH_OPTIONS,
          width: size.width,
          height: size.height,
          measureMs: measureSeconds * 1000,
          passes,
        },
        {
          sourceContainer,
          outputContainer,
          videoClassName: styles.video,
        },
        setProgress,
        controller.signal
      )
      setReport(result)
    } catch (error) {
      if (error instanceof BenchAbortError) {
        setProgress({ phase: 'idle' })
      } else {
        setFailure(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }, [measureSeconds, passes, resolution, selected])

  const stop = () => abortRef.current?.abort()

  return (
    <div className={styles.page}>
      <div>
        <h1>Track processor benchmark</h1>
        <p className={styles.note}>
          Measures any livekit <code>TrackProcessor</code> under an identical
          protocol: one camera track, warm up, measure, tear down, repeated with
          the running order reversed. Dev-only page.
        </p>
      </div>

      {!supportsRvfc() && (
        <p className={styles.error}>
          This browser has no requestVideoFrameCallback, so frame pacing cannot
          be measured. FPS falls back to decoded-frame counts and jitter is
          unavailable.
        </p>
      )}
      {!supportsLongTasks() && (
        <p className={styles.error}>
          This browser does not report long tasks, so main-thread blocking
          columns will be empty. Chromium reports them.
        </p>
      )}

      <div className={styles.contenders}>
        <strong>Processors</strong>
        {BENCH_CONTENDERS.map((contender) => (
          <label key={contender.id}>
            <input
              type="checkbox"
              checked={selected.includes(contender.id)}
              disabled={running}
              onChange={() => toggle(contender.id)}
            />{' '}
            {contender.label}{' '}
            <span className={styles.note}>{contender.description}</span>
          </label>
        ))}
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          Resolution
          <select
            value={resolution}
            disabled={running}
            onChange={(event) => setResolution(event.target.value)}
          >
            {RESOLUTIONS.map((item) => (
              <option key={item.label} value={item.label}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          Measure seconds
          <input
            type="number"
            min={3}
            max={120}
            value={measureSeconds}
            disabled={running}
            onChange={(event) => setMeasureSeconds(Number(event.target.value))}
          />
        </label>

        <label className={styles.field}>
          Passes
          <input
            type="number"
            min={1}
            max={6}
            value={passes}
            disabled={running}
            onChange={(event) => setPasses(Number(event.target.value))}
          />
        </label>

        <button
          type="button"
          className={styles.button}
          onClick={start}
          disabled={running || selected.length === 0}
        >
          Run benchmark
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={stop}
          disabled={!running}
        >
          Stop
        </button>

        <span className={styles.note}>~{estimatedSeconds}s total</span>
      </div>

      <p>
        <strong>Status:</strong> {describeProgress(progress)}
      </p>
      {failure && <p className={styles.error}>{failure}</p>}

      {/*
        The harness owns these video elements: it creates a fresh pair per run,
        the way livekit's setProcessor does, so no `loadeddata` state carries
        from one processor's start-up into the next.
      */}
      <div className={styles.previews}>
        <div>
          <div className={styles.note}>Camera source</div>
          <div ref={sourceContainerRef} className={styles.videoSlot} />
        </div>
        <div>
          <div className={styles.note}>Processor output</div>
          <div ref={outputContainerRef} className={styles.videoSlot} />
        </div>
      </div>

      {report && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Processor</th>
                  <th>FPS</th>
                  <th>Frame p95 (ms)</th>
                  <th>rAF p50 (ms)</th>
                  <th>rAF p95 (ms)</th>
                  <th>Blocking (ms)</th>
                  <th>Long tasks</th>
                  <th>Busy %</th>
                  <th>Startup cold (ms)</th>
                  <th>Startup warm (ms)</th>
                  <th>Heap peak</th>
                </tr>
              </thead>
              <tbody>
                {report.results.map((result) => (
                  <tr key={result.contenderId}>
                    <td>{result.label}</td>
                    <td>{fmt(result.averaged.fps)}</td>
                    <td>{fmt(result.averaged.frameP95Ms)}</td>
                    <td>{fmt(result.averaged.rafP50Ms)}</td>
                    <td>{fmt(result.averaged.rafP95Ms)}</td>
                    <td>{fmt(result.averaged.blockingMs, 0)}</td>
                    <td>{fmt(result.averaged.longTaskCount, 0)}</td>
                    <td>{fmt(result.averaged.longTaskSharePct)}</td>
                    <td>{fmt(result.coldStartupMs, 0)}</td>
                    <td>{fmt(result.warmStartupMs, 0)}</td>
                    <td>{fmtMb(result.runs[0]?.heap.peakBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {report.results.map((result) => (
            <div key={result.contenderId}>
              {result.notes.map((note) => (
                <div key={note} className={styles.note}>
                  {result.label}: {note}
                </div>
              ))}
              {result.errors.map((error) => (
                <div key={error} className={styles.error}>
                  {result.label}: {error}
                </div>
              ))}
            </div>
          ))}

          <button
            type="button"
            className={styles.button}
            onClick={() =>
              navigator.clipboard.writeText(JSON.stringify(report, null, 2))
            }
          >
            Copy JSON report
          </button>
        </>
      )}
    </div>
  )
}

export default ProcessorBenchPage
