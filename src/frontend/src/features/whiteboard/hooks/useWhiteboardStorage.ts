import { useEffect, useCallback, useRef } from 'react'
import type {
  ExcalidrawImperativeAPI,
  AppState,
} from '@excalidraw/excalidraw/types'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  WhiteboardStorageAdapter,
  BinaryFiles,
  ExcalidrawElement,
} from '../types/storage'

export interface UseWhiteboardStorageOptions {
  excalidrawAPI: ExcalidrawImperativeAPI | null | undefined
  roomId: string
  storage: WhiteboardStorageAdapter
  onChange?: (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles
  ) => void
}

interface FetchFailureRecord {
  count: number
  lastTried: number
  isNotFound: boolean
}

const MAX_NOT_FOUND_RETRIES = 5
const NOT_FOUND_BASE_DELAY_MS = 2500 // 2.5s initial grace window for in-flight remote uploads

const MAX_NETWORK_RETRIES = 3
const NETWORK_BASE_DELAY_MS = 1000

export const useWhiteboardStorage = ({
  excalidrawAPI,
  roomId,
  storage,
  onChange,
}: UseWhiteboardStorageOptions) => {
  const pendingUploadsRef = useRef<Set<string>>(new Set())
  const pendingFetchesRef = useRef<Set<string>>(new Set())
  const failedFetchesRef = useRef<Map<string, FetchFailureRecord>>(new Map())
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  // Reset tracking state if the room changes
  useEffect(() => {
    pendingUploadsRef.current.clear()
    pendingFetchesRef.current.clear()
    failedFetchesRef.current.clear()
  }, [roomId])

  const shouldAttemptFetch = useCallback((fileId: string): boolean => {
    const failure = failedFetchesRef.current.get(fileId)
    if (!failure) return true

    const maxRetries = failure.isNotFound
      ? MAX_NOT_FOUND_RETRIES
      : MAX_NETWORK_RETRIES
    if (failure.count >= maxRetries) return false

    const baseDelay = failure.isNotFound
      ? NOT_FOUND_BASE_DELAY_MS
      : NETWORK_BASE_DELAY_MS
    const multiplier = failure.isNotFound
      ? Math.pow(1.5, failure.count - 1)
      : Math.pow(2, failure.count - 1)
    const backoffDelay = baseDelay * multiplier

    return Date.now() - failure.lastTried >= backoffDelay
  }, [])

  const recordFetchFailure = useCallback(
    (fileId: string, isNotFound: boolean) => {
      const current = failedFetchesRef.current.get(fileId)
      const count = (current?.count ?? 0) + 1
      failedFetchesRef.current.set(fileId, {
        count,
        lastTried: Date.now(),
        isNotFound,
      })

      const maxRetries = isNotFound
        ? MAX_NOT_FOUND_RETRIES
        : MAX_NETWORK_RETRIES
      if (count >= maxRetries) {
        if (isNotFound) {
          console.warn(
            `[useWhiteboardStorage] Asset "${fileId}" was not found after ${MAX_NOT_FOUND_RETRIES} attempts. Halting retries.`
          )
        } else {
          console.warn(
            `[useWhiteboardStorage] Halted retrying asset "${fileId}" after ${MAX_NETWORK_RETRIES} network/server failures.`
          )
        }
      }
    },
    []
  )

  const handleFilesChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      if (!excalidrawAPI) return

      // 1. Upload new files dropped locally
      if (files) {
        for (const [fileId, fileData] of Object.entries(files)) {
          if (!storage.hasFile(fileId) && !pendingUploadsRef.current.has(fileId)) {
            pendingUploadsRef.current.add(fileId)
            storage
              .uploadFile(roomId, fileId, fileData)
              .catch((err) => {
                console.error(
                  `[useWhiteboardStorage] Failed to upload file "${fileId}":`,
                  err
                )
              })
              .finally(() => {
                if (isMounted.current) {
                  pendingUploadsRef.current.delete(fileId)
                }
              })
          }
        }
      }

      // 2. Fetch missing files for remote elements
      const missingFiles = new Set<string>()
      elements.forEach((el: ExcalidrawElement) => {
        if (el.type === 'image' && el.fileId) {
          if (!files || !files[el.fileId]) {
            if (
              !storage.hasFile(el.fileId) &&
              !pendingFetchesRef.current.has(el.fileId) &&
              shouldAttemptFetch(el.fileId)
            ) {
              missingFiles.add(el.fileId)
            }
          }
        }
      })

      missingFiles.forEach((fileId) => {
        pendingFetchesRef.current.add(fileId)
        storage
          .getFile(roomId, fileId)
          .then((fileData) => {
            if (!isMounted.current) return
            if (fileData) {
              failedFetchesRef.current.delete(fileId)
              excalidrawAPI.addFiles([fileData])
            } else {
              recordFetchFailure(fileId, true)
            }
          })
          .catch((err) => {
            if (!isMounted.current) return
            recordFetchFailure(fileId, false)
            console.error(
              `[useWhiteboardStorage] Failed to fetch asset "${fileId}":`,
              err
            )
          })
          .finally(() => {
            if (isMounted.current) {
              pendingFetchesRef.current.delete(fileId)
            }
          })
      })

      if (onChange) {
        onChange(elements, appState, files)
      }
    },
    [
      excalidrawAPI,
      roomId,
      storage,
      onChange,
      shouldAttemptFetch,
      recordFetchFailure,
    ]
  )

  return {
    onFilesChange: handleFilesChange,
  }
}
