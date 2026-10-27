import { useCallback } from 'react'
import { useSnapshot } from 'valtio'
import { useRoomContext } from '@livekit/components-react'
import { whiteboardStore } from '@/stores/whiteboard'
import { userStore } from '@/stores/user'
import { useNotifyParticipants } from '@/features/notifications'
import { NotificationType } from '@/features/notifications/NotificationType'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'

export const useWhiteboard = () => {
  const { isOpen, isSharing, sharerName, sharerIdentity } =
    useSnapshot(whiteboardStore)
  const { username } = useSnapshot(userStore)
  const room = useRoomContext()
  const { notifyParticipants } = useNotifyParticipants()
  const roomData = useRoomData()
  const isAdminOrOwner = useIsAdminOrOwner()

  const isWhiteboardAllowedByRoom =
    roomData?.configuration?.allow_whiteboard ?? true
  // Admins and owners can always toggle/share the whiteboard even if participant sharing is disabled
  const canToggleWhiteboard = isAdminOrOwner || isWhiteboardAllowedByRoom
  const isReadOnly = !canToggleWhiteboard

  const localIdentity = room.localParticipant?.identity
  const isLocalSharer = Boolean(
    sharerIdentity && localIdentity && sharerIdentity === localIdentity
  )

  const openWhiteboard = useCallback(
    (broadcast = true) => {
      if (!canToggleWhiteboard) return

      whiteboardStore.isOpen = true
      whiteboardStore.isSharing = true
      whiteboardStore.sharerName = username || null
      whiteboardStore.sharerIdentity = localIdentity || null

      if (broadcast) {
        void notifyParticipants({
          type: NotificationType.WhiteboardStarted,
          additionalData: {
            sharerName: username || localIdentity || 'Someone',
            sharerIdentity: localIdentity,
          },
        })
      }
    },
    [canToggleWhiteboard, localIdentity, notifyParticipants, username]
  )

  const closeWhiteboard = useCallback(
    (broadcast = true) => {
      if (!canToggleWhiteboard) return

      whiteboardStore.isOpen = false
      whiteboardStore.isSharing = false
      whiteboardStore.sharerName = null
      whiteboardStore.sharerIdentity = null

      if (broadcast) {
        void notifyParticipants({
          type: NotificationType.WhiteboardStopped,
          additionalData: {
            sharerName: username || localIdentity || 'Someone',
            sharerIdentity: localIdentity,
          },
        })
      }
    },
    [canToggleWhiteboard, localIdentity, notifyParticipants, username]
  )

  const toggleWhiteboard = useCallback(() => {
    if (!canToggleWhiteboard) return

    if (isOpen) {
      closeWhiteboard(true)
    } else {
      openWhiteboard(true)
    }
  }, [canToggleWhiteboard, closeWhiteboard, isOpen, openWhiteboard])

  return {
    isOpen,
    isSharing,
    sharerName,
    isLocalSharer,
    isWhiteboardAllowed: canToggleWhiteboard,
    canUseWhiteboard: canToggleWhiteboard,
    canToggleWhiteboard,
    isReadOnly,
    openWhiteboard,
    closeWhiteboard,
    toggleWhiteboard,
  }
}
