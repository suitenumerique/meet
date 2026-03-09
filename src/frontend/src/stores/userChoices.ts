import { proxy, subscribe } from 'valtio'
import { subscribeKey } from 'valtio/utils'
import { ProcessorConfig } from '@/features/rooms/livekit/components/blur'
import {
  loadUserChoices,
  LocalUserChoices as LocalUserChoicesLK,
  saveUserChoices,
} from '@livekit/components-core'
import { VideoQuality } from 'livekit-client'
import localforage from 'localforage'
import { subscribeKeyWithPrev } from '@/stores/utils.ts'

const backgroundImageStore = localforage.createInstance({
  name: 'background-image-store',
  version: 1,
})
const LAST_BACKGROUND_IMAGE_KEY = 'last-background-image'
const LAST_RAW_LOCAL_BACKGROUND_IMAGE_KEY = 'last-raw-local-background-image'
const LAST_LOCAL_BACKGROUND_IMAGE_KEY = 'last-local-background-image'

export type VideoResolution = 'h720' | 'h360' | 'h180'

export type LocalUserChoices = LocalUserChoicesLK & {
  processorConfig?: ProcessorConfig
  lastSelectedLocalImageBackground?: {
    id: string // local-<uuid>
    label: string
    rawUrl: string
    url: string
  }
  noiseReductionEnabled?: boolean
  audioOutputDeviceId?: string
  videoPublishResolution?: VideoResolution
  videoSubscribeQuality?: VideoQuality
}

function getUserChoicesState(): LocalUserChoices & {
  isStoreFullyLoaded: boolean
} {
  return {
    isStoreFullyLoaded: false,
    noiseReductionEnabled: false,
    audioOutputDeviceId: 'default', // Use 'default' to match LiveKit's standard device selection behavior
    videoPublishResolution: 'h720',
    videoSubscribeQuality: VideoQuality.HIGH,
    ...loadUserChoices(),
  }
}

export const userChoicesStore = proxy<
  LocalUserChoices & { isStoreFullyLoaded: boolean }
>(getUserChoicesState())
subscribe(userChoicesStore, () => {
  saveUserChoices(userChoicesStore, false)
})

userChoicesStore.isStoreFullyLoaded = false
const restoreBackupPromises = []

if (
  userChoicesStore.processorConfig?.type === 'virtual' &&
  userChoicesStore.processorConfig.imagePath?.startsWith('blob:')
) {
  restoreBackupPromises.push(
    // restoring last custom background image that was selected
    backgroundImageStore
      .getItem(LAST_BACKGROUND_IMAGE_KEY)
      .then((blob) => {
        if (userChoicesStore.processorConfig?.type === 'virtual') {
          if (blob instanceof Blob) {
            userChoicesStore.processorConfig!.imagePath =
              URL.createObjectURL(blob)
          } else {
            // if we cannot restore
            userChoicesStore.processorConfig = undefined
          }
        }
      })
      .catch(() => {
        // if we cannot restore
        userChoicesStore.processorConfig = undefined
      })
  )
}

if (userChoicesStore.lastSelectedLocalImageBackground) {
  restoreBackupPromises.push(
    // restoring last custom background image that was selected
    backgroundImageStore
      .getItem(LAST_RAW_LOCAL_BACKGROUND_IMAGE_KEY)
      .then((blob) => {
        if (blob instanceof Blob) {
          userChoicesStore.lastSelectedLocalImageBackground!.rawUrl =
            URL.createObjectURL(blob)
        }
      })
  )
  restoreBackupPromises.push(
    // restoring last custom background image that was selected
    backgroundImageStore
      .getItem(LAST_LOCAL_BACKGROUND_IMAGE_KEY)
      .then((blob) => {
        if (blob instanceof Blob) {
          userChoicesStore.lastSelectedLocalImageBackground!.url =
            URL.createObjectURL(blob)
        }
      })
  )
}

// ------------------------------
// Background image local storage
// ------------------------------
// We need to store (ideally in IndexedDb) the last image that was used a virtual background
// So that we can properly restore it the next time the user opens the app.
//
// We use localforage for easily storing the blob in IndexedDb.
// We do this because URL.createObjectURL are only valid for the current session so we need to
// recreate them each time the user opens the app.

subscribeKey(userChoicesStore, 'processorConfig', (v) => {
  if (v?.type === 'virtual') {
    if (v.imagePath?.startsWith('blob:')) {
      // We store the image when the processor config is updated.
      fetch(v.imagePath).then((response) => {
        if (response.ok) {
          response.blob().then((blob) => {
            backgroundImageStore.setItem(LAST_BACKGROUND_IMAGE_KEY, blob)
          })
        }
      })
    }
  }
})

// We do the same for the last selected local image background
// (when the user is not connected, or the upload feature is not available)
subscribeKey(userChoicesStore, 'lastSelectedLocalImageBackground', (v) => {
  if (!v) return
  // We need the rawUrl for the thumbnail
  fetch(v.rawUrl).then((response) => {
    if (response.ok) {
      response.blob().then((blob) => {
        backgroundImageStore.setItem(LAST_RAW_LOCAL_BACKGROUND_IMAGE_KEY, blob)
      })
    }
  })
  fetch(v.url).then((response) => {
    if (response.ok) {
      response.blob().then((blob) => {
        backgroundImageStore.setItem(LAST_LOCAL_BACKGROUND_IMAGE_KEY, blob)
      })
    }
  })
})

// ------------------------------
// ObjectURL cleanup
// ------------------------------

subscribeKeyWithPrev(
  userChoicesStore,
  'processorConfig',
  (newConfig, previousConfig) => {
    if (
      previousConfig &&
      previousConfig.type === 'virtual' &&
      previousConfig.imagePath.startsWith('blob:')
    ) {
      if (
        newConfig &&
        newConfig.type === 'virtual' &&
        newConfig.imagePath === previousConfig.imagePath
      ) {
        // We don't need to do anything if the image path is the same
        return
      }
      // We need to clean up the previous blob URL
      URL.revokeObjectURL(previousConfig.imagePath)
    }
  }
)

subscribeKeyWithPrev(
  userChoicesStore,
  'lastSelectedLocalImageBackground',
  (newInfo, prevInfo) => {
    if (prevInfo) {
      if (newInfo && newInfo.id === prevInfo.id) {
        // We don't need to do anything if the image path is the same
        return
      }

      // We need to clean up the previous blob URL
      URL.revokeObjectURL(prevInfo.rawUrl)
      URL.revokeObjectURL(prevInfo.url)
    }
  }
)

// ------------------------------
// Final store initialization
// ------------------------------

// Once all the restore promises are resolved, we can mark the store as fully loaded
Promise.all(restoreBackupPromises).finally(() => {
  userChoicesStore.isStoreFullyLoaded = true
})
