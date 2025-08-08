import { proxy } from 'valtio'

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
}

export const permissionsStore = proxy<State>({
  cameraPermission: undefined,
  microphonePermission: undefined,
  isLoading: true,
})
