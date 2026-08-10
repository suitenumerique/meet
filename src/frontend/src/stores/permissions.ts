import { proxy } from 'valtio'
import { isFireFox, isMacintosh } from '@/utils/livekit'
import { isAndroid } from '@/utils/os'

type PermissionState = undefined | 'granted' | 'prompt' | 'denied'

type State = {
  cameraPermission: PermissionState
  microphonePermission: PermissionState
  cameraSystemDenied: boolean
  microphoneSystemDenied: boolean
  isLoading: boolean
  isPermissionDialogOpen: boolean
  isSystemPermissionDialogOpen: boolean
  requestOrigin?: 'audioinput' | 'videoinput'
  isCameraGranted: boolean
  isMicrophoneGranted: boolean
  isCameraDenied: boolean
  isMicrophoneDenied: boolean
  isCameraPrompted: boolean
  isMicrophonePrompted: boolean
}

export const permissionsStore = proxy<State>({
  cameraPermission: undefined,
  microphonePermission: undefined,
  cameraSystemDenied: false,
  microphoneSystemDenied: false,
  isLoading: true,
  isPermissionDialogOpen: false,
  isSystemPermissionDialogOpen: false,
  requestOrigin: undefined,
  get isCameraGranted() {
    return this.cameraPermission === 'granted'
  },
  get isMicrophoneGranted() {
    return this.microphonePermission === 'granted'
  },
  get isCameraDenied() {
    return this.cameraPermission === 'denied'
  },
  get isMicrophoneDenied() {
    return this.microphonePermission === 'denied'
  },
  get isCameraPrompted() {
    return this.cameraPermission === 'prompt'
  },
  get isMicrophonePrompted() {
    return this.microphonePermission === 'prompt'
  },
})

export const openPermissionsDialog = (
  requestOrigin?: 'audioinput' | 'videoinput'
) => {
  // When the block is at the OS level, browser-side instructions are
  // useless — route to the system permissions dialog instead.
  const systemBlocked =
    requestOrigin === 'audioinput'
      ? permissionsStore.microphoneSystemDenied
      : requestOrigin === 'videoinput'
        ? permissionsStore.cameraSystemDenied
        : permissionsStore.microphoneSystemDenied ||
          permissionsStore.cameraSystemDenied
  if (systemBlocked) {
    openSystemPermissionsDialog()
    return
  }
  permissionsStore.isPermissionDialogOpen = true
  permissionsStore.requestOrigin = requestOrigin
}

export const openSystemPermissionsDialog = () => {
  // Never show both dialogs stacked: the system-level one wins.
  permissionsStore.isPermissionDialogOpen = false
  permissionsStore.isSystemPermissionDialogOpen = true
}

export const closeSystemPermissionsDialog = () => {
  permissionsStore.isSystemPermissionDialogOpen = false
}

export const closePermissionsDialog = () => {
  permissionsStore.isPermissionDialogOpen = false
}

export type PermissionKind = 'camera' | 'microphone'

const KIND_MAP = {
  camera: 'videoinput',
  microphone: 'audioinput',
} as const

export const PERMISSION_BY_DEVICE_KIND: Partial<
  Record<MediaDeviceKind, PermissionKind>
> = {
  videoinput: 'camera',
  audioinput: 'microphone',
}

export const setPermissions = (
  p: Partial<Record<PermissionKind, PermissionState>>
) => {
  if (p.camera && p.camera !== permissionsStore.cameraPermission) {
    permissionsStore.cameraPermission = p.camera
  }
  if (p.microphone && p.microphone !== permissionsStore.microphonePermission) {
    permissionsStore.microphonePermission = p.microphone
  }
  permissionsStore.isLoading = false
}

const queryPermission = async (name: PermissionKind) => {
  try {
    const status = await navigator.permissions.query({
      name: name as PermissionName,
    })
    return status.state
  } catch {
    return undefined
  }
}

const labelsVisible = async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return (kind: PermissionKind) =>
      devices.some((d) => d.kind === KIND_MAP[kind] && !!d.label)
  } catch {
    return (_kind: PermissionKind) => false
  }
}

/**
 * Outcomes witnessed first-hand from getUserMedia this session. The
 * Permissions API is a weaker signal in both directions on Firefox:
 *
 * - denials: Firefox < 151 keeps temporary (non-"remembered") denials at
 *   'prompt' — the default mode on mobile — and some browsers cannot
 *   query camera/microphone at all;
 * - grants: one-time grants are coupled to the active capture, so the
 *   query drops back to 'prompt' the moment a track stops (e.g. the user
 *   toggling a device off), and the PermissionStatus change event
 *   re-syncs at exactly that moment.
 *
 * Without this memory, every syncPermissions (focus, devicechange,
 * status change) clobbers the state right back to 'prompt', which the UI
 * renders as "permission needed" — mid-session, on devices that just
 * worked. A queried 'prompt' therefore never downgrades a witnessed
 * outcome; only hard evidence (a queried 'granted'/'denied', or the next
 * gUM outcome) replaces it.
 */
const gumOutcome: Record<PermissionKind, 'granted' | 'denied' | undefined> = {
  camera: undefined,
  microphone: undefined,
}

export const syncPermissions = async () => {
  const [camera, microphone] = await Promise.all([
    queryPermission('camera'),
    queryPermission('microphone'),
  ])
  const granted = camera && microphone ? () => false : await labelsVisible()
  const resolve = (
    kind: PermissionKind,
    queried?: PermissionState
  ): PermissionState => {
    // Hard evidence from the Permissions API wins in both directions.
    if (queried === 'granted' || (!queried && granted(kind))) {
      gumOutcome[kind] = 'granted'
      return 'granted'
    }
    if (queried === 'denied') {
      gumOutcome[kind] = 'denied'
      return 'denied'
    }
    // 'prompt' (or no query support): a witnessed gUM outcome is the
    // stronger signal — keep it.
    if (gumOutcome[kind]) return gumOutcome[kind]
    if (queried === 'prompt') return 'prompt'
    const current =
      kind === 'camera'
        ? permissionsStore.cameraPermission
        : permissionsStore.microphonePermission
    if (current === 'denied') return 'denied'
    return 'prompt'
  }
  const resolved = {
    camera: resolve('camera', camera),
    microphone: resolve('microphone', microphone),
  }
  setPermissions(resolved)
}

export const notePermissionDeniedFromGum = (kind?: PermissionKind) => {
  // A combined audio+video request fails atomically: no kind means the
  // denial covers both devices.
  const kinds: PermissionKind[] = kind ? [kind] : ['microphone', 'camera']
  const denied: Partial<Record<PermissionKind, PermissionState>> = {}
  for (const k of kinds) {
    gumOutcome[k] = 'denied'
    denied[k] = 'denied'
  }
  setPermissions(denied)
  void syncPermissions()
}

export type PermissionDeniedScope = 'browser' | 'system'

/**
 * Chromium reports OS-level blocks (macOS/Windows privacy settings) with an
 * explicit, non-localized message: "Permission denied by system", as opposed
 * to "Permission denied" for a browser-level block.
 */
export const isSystemPermissionError = (error: unknown): boolean =>
  (error as Error)?.name === 'NotAllowedError' &&
  /by system/i.test((error as Error)?.message ?? '')

/**
 * Decides whether a getUserMedia permission failure comes from the browser
 * or from the OS. Fallback for non-Chromium browsers: gUM rejected with
 * NotAllowedError although the browser-level permission is granted — the
 * block can only come from the OS.
 */
export const classifyPermissionError = async (
  error: unknown,
  kind?: PermissionKind
): Promise<PermissionDeniedScope> => {
  if (isSystemPermissionError(error)) return 'system'
  if ((error as Error)?.name !== 'NotAllowedError') return 'browser'
  const kinds: PermissionKind[] = kind ? [kind] : ['microphone', 'camera']
  const states = await Promise.all(kinds.map(queryPermission))
  return states.every((state) => state === 'granted') ? 'system' : 'browser'
}

/**
 * Firefox surfaces OS-level blocks as NotFoundError ("The object can not
 * be found here.") instead of NotAllowedError.
 *
 * - macOS: tell it apart from a genuinely missing device — the device
 *   still shows up in enumerateDevices.
 * - Android: Fenix rejects with NotFoundError when the app itself lacks
 *   the Android camera/mic permission (mozilla-mobile/fenix#15023), often
 *   before any site prompt, and may hide the blocked devices from
 *   enumerateDevices entirely. Phones and tablets always have both
 *   devices, so "not found" there means an OS-level block, not missing
 *   hardware.
 */
export const isLikelySystemNotFound = async (
  error: unknown,
  kind?: PermissionKind
): Promise<boolean> => {
  if ((error as Error)?.name !== 'NotFoundError') return false
  if (!isFireFox()) return false
  if (isAndroid()) return true
  if (!isMacintosh()) return false
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const deviceKinds = kind
      ? [KIND_MAP[kind]]
      : (['audioinput', 'videoinput'] as const)
    return deviceKinds.every((deviceKind) =>
      devices.some((device) => device.kind === deviceKind)
    )
  } catch {
    return false
  }
}

export const noteSystemPermissionDenied = (kind?: PermissionKind) => {
  // Only flags the state (shown as the blocked-device hint on the toggle);
  // the dialog itself opens when the user clicks the blocked toggle.
  const kinds: PermissionKind[] = kind ? [kind] : ['microphone', 'camera']
  for (const k of kinds) {
    const key = k === 'camera' ? 'cameraSystemDenied' : 'microphoneSystemDenied'
    permissionsStore[key] = true
  }
  void syncPermissions()
}

/**
 * Successful acquisition proves the permission is granted and the OS no
 * longer blocks the device — record it directly, since the Permissions
 * API may still report 'prompt' (Firefox one-time grants).
 */
export const noteGumSuccess = (kind?: PermissionKind) => {
  const kinds: PermissionKind[] = kind ? [kind] : ['microphone', 'camera']
  const granted: Partial<Record<PermissionKind, PermissionState>> = {}
  for (const k of kinds) {
    gumOutcome[k] = 'granted'
    granted[k] = 'granted'
    if (k === 'camera') permissionsStore.cameraSystemDenied = false
    else permissionsStore.microphoneSystemDenied = false
  }
  setPermissions(granted)
}
