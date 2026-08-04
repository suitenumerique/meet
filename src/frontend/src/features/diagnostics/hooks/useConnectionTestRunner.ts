import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckStatus,
  ConnectionCheck,
  createLocalAudioTrack,
  createLocalVideoTrack,
  getBrowser,
  type CheckInfo,
} from 'livekit-client'
import { fetchConnectionTestDetails } from '../api/fetchConnectionTestDetails'
import { SelectedCandidateCheck } from '../checks/selectedCandidate'
import {
  createInitialSteps,
  type ConnectionTestLog,
  type ConnectionTestStepId,
  type ConnectionTestStepResult,
  type ConnectionTestStepStatus,
} from '../types'
import { openPermissionsDialog } from '@/stores/permissions'

const LIVEKIT_STEP_IDS: ConnectionTestStepId[] = [
  'websocket',
  'webrtc',
  'turn',
  'reconnect',
  'selectedCandidate',
  'publishAudio',
  'publishVideo',
]

const CHECK_STATUS_TO_STEP: Record<CheckStatus, ConnectionTestStepStatus> = {
  [CheckStatus.IDLE]: 'pending',
  [CheckStatus.RUNNING]: 'running',
  [CheckStatus.SUCCESS]: 'success',
  [CheckStatus.FAILED]: 'failed',
  [CheckStatus.SKIPPED]: 'skipped',
}

/** getUserMedia rejections that mean "the user said no", not "the device is broken". */
const PERMISSION_ERROR_NAMES = new Set([
  'NotAllowedError',
  'PermissionDeniedError',
  'SecurityError',
])

const getErrorMessage = (error: unknown, fallback = 'Unknown error') =>
  error instanceof Error ? error.message : fallback

const isPermissionError = (error: unknown) =>
  error instanceof Error && PERMISSION_ERROR_NAMES.has(error.name)

const fromCheckInfo = (info: CheckInfo): Partial<ConnectionTestStepResult> => ({
  status: CHECK_STATUS_TO_STEP[info.status] ?? 'failed',
  summary: info.description,
  logs: info.logs,
})

const groupDevicesByKind = (devices: MediaDeviceInfo[]) => {
  const grouped: Record<string, string[]> = {
    audioinput: [],
    audiooutput: [],
    videoinput: [],
  }
  for (const device of devices) {
    // Browsers are free to report kinds we don't know about yet.
    const bucket = (grouped[device.kind] ??= [])
    bucket.push(device.label || device.deviceId)
  }
  return grouped
}

/**
 * Outcome of a single step. `aborted` is deliberately distinct from `failed`:
 * a cancelled run must not be reported to the user as a broken device.
 */
type StepOutcome =
  | { state: 'success' }
  | { state: 'failed'; error: unknown }
  | { state: 'aborted' }

const ABORTED: StepOutcome = { state: 'aborted' }

export const useConnectionTestRunner = () => {
  const [steps, setSteps] = useState(createInitialSteps)
  const [isRunning, setIsRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const updateStep = useCallback(
    (id: ConnectionTestStepId, patch: Partial<ConnectionTestStepResult>) => {
      setSteps((current) =>
        current.map((step) => (step.id === id ? { ...step, ...patch } : step))
      )
    },
    []
  )

  const skipSteps = useCallback(
    (
      ids: ConnectionTestStepId[],
      summary: string,
      logs?: ConnectionTestLog[]
    ) => {
      // One state update for the whole batch instead of one per step.
      const targets = new Set(ids)
      setSteps((current) =>
        current.map((step) =>
          targets.has(step.id)
            ? { ...step, status: 'skipped', summary, logs }
            : step
        )
      )
    },
    []
  )

  const runStep = useCallback(
    async (
      id: ConnectionTestStepId,
      signal: AbortSignal,
      fn: () => Promise<Partial<ConnectionTestStepResult>>
    ): Promise<StepOutcome> => {
      if (signal.aborted) return ABORTED

      updateStep(id, {
        status: 'running',
        summary: undefined,
        logs: undefined,
        data: undefined,
      })

      try {
        const result = await fn()
        if (signal.aborted) return ABORTED
        // `result.status` overrides when set (LiveKit checks map their own status)
        updateStep(id, { status: 'success', ...result })
        return { state: 'success' }
      } catch (error) {
        if (signal.aborted) return ABORTED
        updateStep(id, {
          status: 'failed',
          summary: getErrorMessage(error),
        })
        return { state: 'failed', error }
      }
    },
    [updateStep]
  )

  const runTest = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setIsRunning(true)
    setSteps(createInitialSteps())

    try {
      await runStep('browser', signal, async () => {
        const browser = getBrowser()
        if (!browser) throw new Error('Browser not detected')
        return {
          summary: `${browser.name} ${browser.version}`,
          data: {
            name: browser.name,
            version: browser.version,
            os: browser.os,
            osVersion: browser.osVersion,
          },
        }
      })
      if (signal.aborted) return

      const microphone = await runStep('microphone', signal, async () => {
        const track = await createLocalAudioTrack()
        const label =
          track.mediaStreamTrack.label ||
          track.mediaStreamTrack.getSettings().deviceId ||
          ''
        track.stop()
        return { summary: label, data: { label } }
      })
      if (signal.aborted) return
      if (
        microphone.state === 'failed' &&
        isPermissionError(microphone.error)
      ) {
        openPermissionsDialog('audioinput')
      }

      const camera = await runStep('camera', signal, async () => {
        const track = await createLocalVideoTrack()
        const settings = track.mediaStreamTrack.getSettings()
        const label = track.mediaStreamTrack.label || ''
        // Released immediately, like the microphone probe: the capture
        // indicator must not stay on between this check and publishVideo.
        track.stop()
        return {
          summary: label,
          data: {
            label,
            width: settings.width,
            height: settings.height,
          },
        }
      })
      if (signal.aborted) return
      if (camera.state === 'failed' && isPermissionError(camera.error)) {
        openPermissionsDialog('videoinput')
      }

      await runStep('devices', signal, async () => {
        const devices = await navigator.mediaDevices.enumerateDevices()
        return {
          summary: String(devices.length),
          data: groupDevicesByKind(devices),
        }
      })
      if (signal.aborted) return

      let checker: ConnectionCheck
      try {
        const { livekit } = await fetchConnectionTestDetails()
        if (signal.aborted) return
        checker = new ConnectionCheck(livekit.url, livekit.token)
      } catch (error) {
        if (signal.aborted) return
        skipSteps(
          LIVEKIT_STEP_IDS,
          getErrorMessage(error, 'Failed to fetch test token')
        )
        return
      }

      // LiveKit's ConnectionCheck exposes no cancellation: each check owns its
      // own room and disconnects it when it settles. The best we can do is
      // never start the next one once the run has been aborted (runStep
      // short-circuits on `signal.aborted`).
      await runStep('websocket', signal, async () =>
        fromCheckInfo(await checker.checkWebsocket())
      )
      await runStep('webrtc', signal, async () =>
        fromCheckInfo(await checker.checkWebRTC())
      )
      await runStep('turn', signal, async () =>
        fromCheckInfo(await checker.checkTURN())
      )
      await runStep('reconnect', signal, async () =>
        fromCheckInfo(await checker.checkReconnect())
      )
      await runStep('selectedCandidate', signal, async () =>
        fromCheckInfo(await checker.createAndRunCheck(SelectedCandidateCheck))
      )

      if (microphone.state !== 'success') {
        skipSteps(['publishAudio'], 'Microphone permission required')
      } else {
        await runStep('publishAudio', signal, async () =>
          fromCheckInfo(await checker.checkPublishAudio())
        )
      }

      if (camera.state !== 'success') {
        skipSteps(['publishVideo'], 'Camera permission required')
      } else {
        await runStep('publishVideo', signal, async () =>
          fromCheckInfo(await checker.checkPublishVideo())
        )
      }
    } finally {
      if (!signal.aborted) {
        setIsRunning(false)
      }
    }
  }, [runStep, skipSteps])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setSteps(createInitialSteps())
    setIsRunning(false)
  }, [])

  // Leaving the page mid-run must stop the pending checks rather than let them
  // keep a LiveKit session open behind an unmounted component.
  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    []
  )

  return {
    steps,
    isRunning,
    runTest,
    reset,
  }
}
