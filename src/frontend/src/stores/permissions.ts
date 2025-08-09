import { proxy } from 'valtio'
import { derive } from 'derive-valtio'

type PermissionState =
  | undefined
  | 'granted'
  | 'prompt'
  | 'denied'
  | 'unavailable'

type BaseState = {
  cameraPermission: PermissionState
  microphonePermission: PermissionState
  isLoading: boolean
  isPermissionDialogOpen: boolean
}

type DerivedState = {
  isCameraGranted: boolean
  isMicrophoneGranted: boolean
  isCameraDenied: boolean
  isMicrophoneDenied: boolean
  isCameraPrompted: boolean
  isMicrophonePrompted: boolean
}

type State = BaseState & DerivedState

export const permissionsStore = proxy<BaseState>({
  cameraPermission: undefined,
  microphonePermission: undefined,
  isLoading: true,
  isPermissionDialogOpen: false,
}) as State

derive(
  {
    isCameraGranted: (get) =>
      get(permissionsStore).cameraPermission == 'granted',
    isMicrophoneGranted: (get) =>
      get(permissionsStore).microphonePermission == 'granted',
    isCameraDenied: (get) => get(permissionsStore).cameraPermission == 'denied',
    isMicrophoneDenied: (get) =>
      get(permissionsStore).microphonePermission == 'denied',
    isCameraPrompted: (get) =>
      get(permissionsStore).cameraPermission == 'prompt',
    isMicrophonePrompted: (get) =>
      get(permissionsStore).microphonePermission == 'prompt',
  },
  {
    proxy: permissionsStore,
  }
)

export const openPermissionsDialog = () => {
  permissionsStore.isPermissionDialogOpen = true
}

export const closePermissionsDialog = () => {
  permissionsStore.isPermissionDialogOpen = false
}
