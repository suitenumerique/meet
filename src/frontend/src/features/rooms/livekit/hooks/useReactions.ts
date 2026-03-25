import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Emoji, reactionsStore } from '@/stores/reactions'
import { NotificationType } from '@/features/notifications/NotificationType'
import { ANIMATION_DURATION } from '@/features/rooms/livekit/components/ReactionPortal'
import useRateLimiter from '@/hooks/useRateLimiter'
import { useNotifyParticipants } from '@/features/notifications'
import { Participant } from 'livekit-client'

export const useReactions = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })
  const { notifyParticipants } = useNotifyParticipants()

  const appendReaction = useCallback(
    (emoji: Emoji, participant?: Participant) => {
      const newReaction = {
        id: `${emoji}-${Date.now()}-${Math.random()}`,
        emoji,
        participantName: participant
          ? participant.name || participant.identity
          : t('you'),
        isLocal: !participant,
      }

      reactionsStore.reactions.push(newReaction)

      setTimeout(() => {
        const index = reactionsStore.reactions.findIndex(
          (r) => r.id === newReaction.id
        )
        if (index !== -1) reactionsStore.reactions.splice(index, 1)
      }, ANIMATION_DURATION)
    },
    [t]
  )

  const sendReaction = async (emoji: Emoji) => {
    appendReaction(emoji)
    await notifyParticipants({
      type: NotificationType.ReactionReceived,
      additionalData: { data: { emoji } },
    })
  }

  const debouncedSendReaction = useRateLimiter({
    callback: sendReaction,
    maxCalls: 10,
    windowMs: 1000,
  })

  return {
    sendReaction: debouncedSendReaction,
    appendReaction,
  }
}
