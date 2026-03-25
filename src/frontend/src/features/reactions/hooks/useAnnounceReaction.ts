import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { accessibilityStore } from '@/stores/accessibility'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'

import { getEmojiLabel } from '../utils'
import { Reaction } from '../types'

export const useAnnounceReaction = (latestReaction: Reaction | undefined) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })
  const { announceReactions } = useSnapshot(accessibilityStore)
  const [lastAnnouncedId, setLastAnnouncedId] = useState<string | null>(null)
  const announce = useScreenReaderAnnounce()

  useEffect(() => {
    if (!announceReactions || !latestReaction) return
    if (latestReaction.id === lastAnnouncedId) return

    const emojiLabel = getEmojiLabel(latestReaction.emoji, t)
    const participantName = latestReaction.participantName

    announce(t('announce', { name: participantName, emoji: emojiLabel }))
    setLastAnnouncedId(latestReaction.id)
  }, [announce, latestReaction, lastAnnouncedId, announceReactions, t])
}
