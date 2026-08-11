import { proxy } from 'valtio'
import { captureEvent } from '@/features/analytics/telemetry'

const DISCARD_STORAGE_KEY = 'silent-mic-detection-discarded'

/**
 * One-shot UX check: a live microphone always produces at least a noise
 * floor, so a mic that stays pinned to zero for a whole minute is not a
 * quiet room — it is an OS-level permission block, a hardware mute
 * switch, or a dead device. The check runs on the join screen and in
 * the room until it settles:
 *
 *   watching → passed     first non-zero sample (check is over, no UI)
 *   watching → silent     45s of accumulated zero signal (warning badge)
 *   silent   → passed     sound finally arrives (warning auto-clears)
 *   any      → discarded  user opts out (persisted on this browser)
 */
export type SilentMicStatus = 'watching' | 'silent' | 'passed' | 'discarded'

const isDiscardPersisted = (): boolean => {
  try {
    return localStorage.getItem(DISCARD_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const silentMicStore = proxy({
  status: (isDiscardPersisted() ? 'discarded' : 'watching') as SilentMicStatus,
  isDialogOpen: false,
})

const SILENT_DURATION_MS = 10_000

// Accumulation is module state, not store state: it changes every tick
// and must survive the join → room transition without re-rendering
// anything.
let silentMs = 0
let watchedTrackId: string | undefined

export type SilentMicSampleResult = 'silent-detected' | 'recovered' | null

/**
 * Feed one detection sample. Returns the transition it caused, so the
 * caller can attach telemetry with its own context.
 */
export const reportMicSample = ({
  trackId,
  silent,
  deltaMs,
}: {
  trackId?: string
  silent: boolean
  deltaMs: number
}): SilentMicSampleResult => {
  const { status } = silentMicStore
  if (status === 'discarded' || status === 'passed') return null

  if (trackId !== watchedTrackId) {
    // New capture (device switch, re-acquire): fresh window.
    watchedTrackId = trackId
    silentMs = 0
  }

  if (!silent) {
    silentMs = 0
    silentMicStore.status = 'passed'
    silentMicStore.isDialogOpen = false
    return status === 'silent' ? 'recovered' : null
  }

  if (status !== 'watching') return null
  silentMs += deltaMs
  if (silentMs >= SILENT_DURATION_MS) {
    silentMicStore.status = 'silent'
    return 'silent-detected'
  }
  return null
}

export const openSilentMicDialog = () => {
  silentMicStore.isDialogOpen = true
}

export const closeSilentMicDialog = () => {
  silentMicStore.isDialogOpen = false
}

export const discardSilentMicDetection = () => {
  silentMicStore.status = 'discarded'
  silentMicStore.isDialogOpen = false
  try {
    localStorage.setItem(DISCARD_STORAGE_KEY, '1')
  } catch {
    /* private mode: the opt-out just won't persist */
  }
  captureEvent('silent-mic-discarded')
}
