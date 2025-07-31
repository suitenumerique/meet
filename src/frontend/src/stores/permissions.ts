import { proxy } from 'valtio'

type PermissionState = undefined | 'granted' | 'prompt' | 'denied'

type State = {
  cameraPermission: PermissionState
  microphonePermission: PermissionState
}

export const permissionStore = proxy<State>({
  cameraPermission: undefined,
  microphonePermission: undefined,
})
