export type ConnectionTestStepId =
  | 'browser'
  | 'microphone'
  | 'camera'
  | 'devices'
  | 'websocket'
  | 'webrtc'
  | 'turn'
  | 'reconnect'
  | 'selectedCandidate'
  | 'publishAudio'
  | 'publishVideo'

export type ConnectionTestStepStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'

export type ConnectionTestLog = {
  level: 'info' | 'warning' | 'error'
  message: string
}

export type ConnectionTestStepResult = {
  id: ConnectionTestStepId
  status: ConnectionTestStepStatus
  summary?: string
  logs?: ConnectionTestLog[]
  data?: Record<string, unknown>
}

export type ConnectionTestGroupId = 'local' | 'network'

/** Display order: everything local first, then everything that leaves the machine. */
export const CONNECTION_TEST_GROUPS: ReadonlyArray<{
  id: ConnectionTestGroupId
  steps: ReadonlyArray<ConnectionTestStepId>
}> = [
  { id: 'local', steps: ['browser', 'microphone', 'camera', 'devices'] },
  {
    id: 'network',
    steps: [
      'websocket',
      'webrtc',
      'turn',
      'reconnect',
      'selectedCandidate',
      'publishAudio',
      'publishVideo',
    ],
  },
]

export const CONNECTION_TEST_STEP_IDS: ConnectionTestStepId[] =
  CONNECTION_TEST_GROUPS.flatMap((group) => [...group.steps])

export const createInitialSteps = (): ConnectionTestStepResult[] =>
  CONNECTION_TEST_STEP_IDS.map((id) => ({ id, status: 'pending' }))

export type ConnectionTestStats = {
  total: number
  settled: number
  passed: number
  failed: number
  skipped: number
  hasStarted: boolean
  progress: number
}

/**
 * Single pass over the steps: the page needs half a dozen derived booleans and
 * counters, and scanning the array once per render beats one `.some()` per flag.
 */
export const summarizeSteps = (
  steps: ConnectionTestStepResult[]
): ConnectionTestStats => {
  let passed = 0
  let failed = 0
  let skipped = 0
  let pending = 0

  for (const step of steps) {
    if (step.status === 'success') passed += 1
    else if (step.status === 'failed') failed += 1
    else if (step.status === 'skipped') skipped += 1
    else if (step.status === 'pending') pending += 1
  }

  const total = steps.length
  const settled = passed + failed + skipped

  return {
    total,
    settled,
    passed,
    failed,
    skipped,
    hasStarted: pending < total,
    progress: total === 0 ? 0 : Math.round((settled / total) * 100),
  }
}
