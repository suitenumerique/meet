import { useEffect, useCallback, useRef, useMemo } from 'react'
import { reconcileElements, CaptureUpdateAction } from '@excalidraw/excalidraw'
import type {
  ExcalidrawImperativeAPI,
  BinaryFiles,
  Gesture,
  AppState,
} from '@excalidraw/excalidraw/types'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { useRoomContext } from '@livekit/components-react'
import { useSnapshot } from 'valtio'
import { userStore } from '@/stores/user'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { getParticipantColor } from '@/features/rooms/utils/getParticipantColor'

export interface UseWhiteboardCollabOptions {
  excalidrawAPI: ExcalidrawImperativeAPI | null
  isReadOnly?: boolean
  onChange?: (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles
  ) => void
}

/**
 * Sorts Yjs elements deterministically based on fractionalIndex or elementOrder array.
 */
const getSortedElements = (
  yMap: Y.Map<OrderedExcalidrawElement>,
  yOrder: Y.Array<string>
): OrderedExcalidrawElement[] => {
  const elements = Array.from(yMap.values())
  const orderArray = yOrder.toArray()
  const orderMap = new Map(orderArray.map((id, index) => [id, index]))

  return elements.sort((a, b) => {
    // 1. Support fractionalIndex / index string comparisons when present
    const aIndex = (a as { fractionalIndex?: string; index?: string }).fractionalIndex ?? (a as { index?: string }).index
    const bIndex = (b as { fractionalIndex?: string; index?: string }).fractionalIndex ?? (b as { index?: string }).index
    if (aIndex !== undefined && bIndex !== undefined) {
      return aIndex < bIndex ? -1 : aIndex > bIndex ? 1 : 0
    }
    // 2. Maintain deterministic layer preservation via Y.Array tracking
    const aPos = orderMap.has(a.id) ? orderMap.get(a.id)! : 0
    const bPos = orderMap.has(b.id) ? orderMap.get(b.id)! : 0
    return aPos - bPos
  })
}

export const useWhiteboardCollab = ({
  excalidrawAPI,
  isReadOnly = false,
  onChange,
}: UseWhiteboardCollabOptions) => {
  const room = useRoomContext()
  const roomData = useRoomData()
  const { username } = useSnapshot(userStore)

  const providerRef = useRef<WebsocketProvider | null>(null)
  const ydocRef = useRef<Y.Doc | null>(null)
  const isUpdatingFromRemote = useRef(false)
  const localVersions = useRef(new Map<string, number>())
  const lastPointerUpdate = useRef(0)

  // Resolve room document ID and WebSocket connection URL
  const roomId = useMemo(() => {
    const slug = roomData?.slug || room?.name || 'default-room'
    return `meet-room-${slug}`
  }, [room?.name, roomData?.slug])

  const collabWsUrl = useMemo(() => {
    if (import.meta.env.VITE_COLLAB_WS_URL) {
      return import.meta.env.VITE_COLLAB_WS_URL
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/collab`
  }, [])

  // Resolve local user identity and color
  const localParticipant = room?.localParticipant
  const localName = useMemo(() => {
    return (
      localParticipant?.name ||
      username ||
      localParticipant?.identity ||
      'Participant'
    )
  }, [localParticipant?.identity, localParticipant?.name, username])

  const localColor = useMemo(() => {
    if (localParticipant) {
      return getParticipantColor(localParticipant)
    }
    return '#3b82f6'
  }, [localParticipant])

  // Setup Yjs WebSocket provider and sync listeners
  useEffect(() => {
    if (!excalidrawAPI) return

    const ydoc = new Y.Doc()
    ydocRef.current = ydoc

    const provider = new WebsocketProvider(collabWsUrl, roomId, ydoc)
    providerRef.current = provider

    // Broadcast local user identity to awareness
    provider.awareness.setLocalStateField('user', {
      name: localName,
      color: localColor,
    })

    const yElements = ydoc.getMap<OrderedExcalidrawElement>('elements')
    const yOrder = ydoc.getArray<string>('elementOrder')

    // Initial sync handler
    const handleSync = (isSynced: boolean) => {
      if (!isSynced) return

      const remoteElements = getSortedElements(yElements, yOrder)
      const localElements = excalidrawAPI.getSceneElements()
      const appState = excalidrawAPI.getAppState()

      const reconciled = reconcileElements(
        localElements,
        remoteElements as unknown as Parameters<typeof reconcileElements>[1],
        appState
      )

      reconciled.forEach((el) => {
        localVersions.current.set(el.id, el.version)
      })

      isUpdatingFromRemote.current = true
      excalidrawAPI.updateScene({
        elements: reconciled,
        captureUpdate: CaptureUpdateAction.NEVER,
      })
      isUpdatingFromRemote.current = false
    }

    provider.on('sync', handleSync)

    // Remote update handler (after transaction)
    const transactionHandler = (transaction: Y.Transaction) => {
      // Ignore local transactions to prevent echo loops
      if (transaction.local) return

      // Only respond if elements or order changed
      const changedTypes = transaction.changed as Map<unknown, unknown>
      if (!changedTypes.has(yElements) && !changedTypes.has(yOrder)) {
        return
      }

      const remoteElements = getSortedElements(yElements, yOrder)
      const localElements = excalidrawAPI.getSceneElements()
      const appState = excalidrawAPI.getAppState()
      const reconciled = reconcileElements(
        localElements,
        remoteElements as unknown as Parameters<typeof reconcileElements>[1],
        appState
      )

      reconciled.forEach((el) => {
        localVersions.current.set(el.id, el.version)
      })

      isUpdatingFromRemote.current = true
      excalidrawAPI.updateScene({
        elements: reconciled,
        captureUpdate: CaptureUpdateAction.NEVER,
      })
      isUpdatingFromRemote.current = false
    }

    ydoc.on('afterTransaction', transactionHandler)

    // Awareness handler (render remote collaborator cursors)
    const awarenessHandler = () => {
      const states = provider.awareness.getStates()
      const collaborators = new Map()

      states.forEach((state, clientId) => {
        if (clientId !== provider.awareness.clientID && state.pointer) {
          collaborators.set(clientId.toString(), {
            pointer: state.pointer,
            button: state.button || 'up',
            username:
              state.user?.name || `Participant ${clientId.toString().slice(-4)}`,
            color: state.user?.color || '#3b82f6',
          })
        }
      })

      excalidrawAPI.updateScene({ collaborators })
    }

    provider.awareness.on('change', awarenessHandler)

    return () => {
      provider.off('sync', handleSync)
      ydoc.off('afterTransaction', transactionHandler)
      provider.awareness.off('change', awarenessHandler)
      provider.awareness.setLocalState(null)
      provider.destroy()
      ydoc.destroy()
      providerRef.current = null
      ydocRef.current = null
    }
  }, [collabWsUrl, excalidrawAPI, localColor, localName, roomId])

  // Handle local Excalidraw element modifications and push incremental updates to Yjs
  const handleOnChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      onChange?.(elements, appState, files)

      // In read-only mode or while remote updates are applying, do not push changes
      if (isReadOnly || isUpdatingFromRemote.current) return
      if (!ydocRef.current || !providerRef.current) return

      const yElements = ydocRef.current.getMap<OrderedExcalidrawElement>('elements')
      const yOrder = ydocRef.current.getArray<string>('elementOrder')

      ydocRef.current.transact(() => {
        // Sync modified elements
        elements.forEach((element) => {
          const knownVersion = localVersions.current.get(element.id) || 0
          if (element.version > knownVersion) {
            yElements.set(element.id, structuredClone(element))
            localVersions.current.set(element.id, element.version)
          }
        })

        // Skip order array mutation if Excalidraw provides fractionalIndex
        const hasFractionalIndex =
          elements.length > 0 &&
          (elements[0] as { fractionalIndex?: string }).fractionalIndex !==
            undefined

        if (!hasFractionalIndex) {
          const currentOrder = yOrder.toArray()
          const newOrder = elements.map((e) => e.id)

          let orderChanged = currentOrder.length !== newOrder.length
          if (!orderChanged) {
            for (let i = 0; i < currentOrder.length; i++) {
              if (currentOrder[i] !== newOrder[i]) {
                orderChanged = true
                break
              }
            }
          }

          if (orderChanged) {
            let commonPrefix = 0
            while (
              commonPrefix < currentOrder.length &&
              commonPrefix < newOrder.length &&
              currentOrder[commonPrefix] === newOrder[commonPrefix]
            ) {
              commonPrefix++
            }

            let commonSuffix = 0
            while (
              commonSuffix < currentOrder.length - commonPrefix &&
              commonSuffix < newOrder.length - commonPrefix &&
              currentOrder[currentOrder.length - 1 - commonSuffix] ===
                newOrder[newOrder.length - 1 - commonSuffix]
            ) {
              commonSuffix++
            }

            const deleteCount =
              currentOrder.length - commonPrefix - commonSuffix
            if (deleteCount > 0) {
              yOrder.delete(commonPrefix, deleteCount)
            }

            const insertItems = newOrder.slice(
              commonPrefix,
              newOrder.length - commonSuffix
            )
            if (insertItems.length > 0) {
              yOrder.insert(commonPrefix, insertItems)
            }
          }
        }
      }, 'local')
    },
    [isReadOnly, onChange]
  )

  // Broadcast throttled pointer movement to awareness (~35ms = ~30fps)
  const handlePointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number; tool: 'pointer' | 'laser' }
      button: 'down' | 'up'
      pointersMap: Gesture['pointers']
    }) => {
      const now = performance.now()
      if (now - lastPointerUpdate.current < 35) return
      lastPointerUpdate.current = now

      if (providerRef.current) {
        providerRef.current.awareness.setLocalStateField(
          'pointer',
          payload.pointer
        )
        providerRef.current.awareness.setLocalStateField(
          'button',
          payload.button
        )
      }
    },
    []
  )

  return {
    onChange: handleOnChange,
    onPointerUpdate: handlePointerUpdate,
  }
}
