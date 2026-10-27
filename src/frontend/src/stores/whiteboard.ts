import { proxy } from 'valtio'

export interface WhiteboardState {
  isOpen: boolean
  isSharing: boolean
  sharerName: string | null
  sharerIdentity: string | null
}

export const whiteboardStore = proxy<WhiteboardState>({
  isOpen: false,
  isSharing: false,
  sharerName: null,
  sharerIdentity: null,
})

export const openWhiteboard = (): void => {
  whiteboardStore.isOpen = true
}

export const closeWhiteboard = (): void => {
  whiteboardStore.isOpen = false
}

export const toggleWhiteboard = (): void => {
  whiteboardStore.isOpen = !whiteboardStore.isOpen
}

export const setWhiteboardSharing = (
  isSharing: boolean,
  sharerName?: string | null,
  sharerIdentity?: string | null
): void => {
  whiteboardStore.isSharing = isSharing
  whiteboardStore.sharerName = sharerName ?? null
  whiteboardStore.sharerIdentity = sharerIdentity ?? null
  if (isSharing) {
    whiteboardStore.isOpen = true
  } else {
    whiteboardStore.isOpen = false
  }
}
