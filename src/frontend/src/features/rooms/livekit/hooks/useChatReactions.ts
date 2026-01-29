import { useCallback } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { useSnapshot } from 'valtio'
import { NotificationType } from '@/features/notifications/NotificationType'
import { NotificationPayload } from '@/features/notifications/NotificationPayload'
import {
  chatReactionsStore,
  addReaction,
  removeReaction,
} from '@/stores/chatReactions'
import useRateLimiter from '@/hooks/useRateLimiter'

// Note: Receiving reactions from other participants is handled in MainNotificationToast.tsx
// This hook handles sending reactions and exposes the store state

export const useChatReactions = () => {
  const room = useRoomContext()
  const { reactions } = useSnapshot(chatReactionsStore)

  const sendReaction = useCallback(
    async (messageId: string, emoji: string, action: 'add' | 'remove') => {
      const encoder = new TextEncoder()
      const payload: NotificationPayload = {
        type: NotificationType.ChatReactionReceived,
        data: {
          messageId,
          emoji,
          action,
          participantName: room.localParticipant.name,
        },
      }
      const data = encoder.encode(JSON.stringify(payload))
      await room.localParticipant.publishData(data, { reliable: true })

      // Update local state immediately
      if (action === 'add') {
        addReaction(messageId, {
          emoji,
          participantIdentity: room.localParticipant.identity,
          participantName: room.localParticipant.name,
        })
      } else {
        removeReaction(messageId, room.localParticipant.identity, emoji)
      }
    },
    [room]
  )

  const rateLimitedSendReaction = useRateLimiter({
    callback: sendReaction,
    maxCalls: 10,
    windowMs: 1000,
  })

  const toggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      const messageReactions = reactions[messageId] || []
      const hasReacted = messageReactions.some(
        (r) =>
          r.participantIdentity === room.localParticipant.identity &&
          r.emoji === emoji
      )
      rateLimitedSendReaction(messageId, emoji, hasReacted ? 'remove' : 'add')
    },
    [reactions, room.localParticipant.identity, rateLimitedSendReaction]
  )

  return {
    reactions,
    toggleReaction,
    getReactionsForMessage: (messageId: string) => reactions[messageId] || [],
  }
}
