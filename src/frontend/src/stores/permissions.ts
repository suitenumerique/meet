import { proxy } from 'valtio'
import { derive } from 'derive-valtio'

type PermissionState =
  | undefined
  | 'granted'
  | 'prompt'
  | 'denied'
  | 'unavailable'

type State = {
  cameraPermission: PermissionState
  microphonePermission: PermissionState
  isLoading: boolean
  isPermissionDialogOpen: boolean
}

export const permissionsStore = proxy<State>({
  cameraPermission: undefined,
  microphonePermission: undefined,
  isLoading: true,
  isPermissionDialogOpen: false,
})

derive(
  {
    isCameraGranted: (get) =>
      get(permissionsStore).cameraPermission == 'granted',
    isMicrophoneGranted: (get) =>
      get(permissionsStore).microphonePermission == 'granted',
    isCameraDenied: (get) => get(permissionsStore).cameraPermission == 'denied',
    isMicrophoneDenied: (get) =>
      get(permissionsStore).microphonePermission == 'denied',
  },
  {
    proxy: permissionsStore,
  }
)
