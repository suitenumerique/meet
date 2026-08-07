import { proxy } from 'valtio'

type PermissionState = undefined | 'granted' | 'prompt' | 'denied'

type State = {
  cameraPermission: PermissionState
  microphonePermission: PermissionState
  isLoading: boolean
  isPermissionDialogOpen: boolean
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
  isLoading: true,
  isPermissionDialogOpen: false,
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
  permissionsStore.isPermissionDialogOpen = true
  permissionsStore.requestOrigin = requestOrigin
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

export const syncPermissions = async () => {
  const [camera, microphone] = await Promise.all([
    queryPermission('camera'),
    queryPermission('microphone'),
  ])
  if (camera && microphone) {
    setPermissions({ camera, microphone })
    return
  }
  const granted = await labelsVisible()
  const resolve = (kind: PermissionKind, queried?: PermissionState) => {
    if (queried) return queried
    const current =
      kind === 'camera'
        ? permissionsStore.cameraPermission
        : permissionsStore.microphonePermission
    if (current === 'denied') return 'denied'
    return granted(kind) ? 'granted' : 'prompt'
  }
  setPermissions({
    camera: resolve('camera', camera),
    microphone: resolve('microphone', microphone),
  })
}

export const notePermissionDeniedFromGum = (kind?: PermissionKind) => {
  if (kind) {
    setPermissions({ [kind]: 'denied' })
    void syncPermissions()
    return
  }
  void syncPermissions()
}
