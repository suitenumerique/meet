import { proxy } from 'valtio'

export interface ChatReaction {
  emoji: string
  participantIdentity: string
  participantName?: string
}

type State = {
  // Map of messageId -> array of reactions
  reactions: Record<string, ChatReaction[]>
}

export const chatReactionsStore = proxy<State>({
  reactions: {},
})

export const addReaction = (
  messageId: string,
  reaction: ChatReaction
): void => {
  const currentReactions = chatReactionsStore.reactions[messageId] || []

  // Check if this participant already reacted with this emoji
  const alreadyExists = currentReactions.some(
    (r) =>
      r.participantIdentity === reaction.participantIdentity &&
      r.emoji === reaction.emoji
  )

  // Only add if not already present - create new array for reactivity
  if (!alreadyExists) {
    chatReactionsStore.reactions[messageId] = [...currentReactions, reaction]
  }
}

export const removeReaction = (
  messageId: string,
  participantIdentity: string,
  emoji: string
): void => {
  if (!chatReactionsStore.reactions[messageId]) {
    return
  }

  chatReactionsStore.reactions[messageId] = chatReactionsStore.reactions[
    messageId
  ].filter(
    (r) => !(r.participantIdentity === participantIdentity && r.emoji === emoji)
  )

  // Clean up empty arrays
  if (chatReactionsStore.reactions[messageId].length === 0) {
    delete chatReactionsStore.reactions[messageId]
  }
}

export const getReactions = (messageId: string): ChatReaction[] => {
  return chatReactionsStore.reactions[messageId] || []
}

export const clearAllReactions = (): void => {
  chatReactionsStore.reactions = {}
}
