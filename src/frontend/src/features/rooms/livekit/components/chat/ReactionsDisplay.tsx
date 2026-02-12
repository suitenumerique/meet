import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { Button } from '@/primitives'
import { ChatReaction } from '@/stores/chatReactions'
import { getEmojiLabel } from '@/features/rooms/livekit/utils/reactionUtils'

interface GroupedReaction {
  emoji: string
  count: number
  participants: { identity: string; name?: string }[]
  hasCurrentUser: boolean
}

interface ReactionsDisplayProps {
  reactions: ChatReaction[]
  currentUserIdentity: string
  onReactionToggle: (emoji: string) => void
}

export const ReactionsDisplay = ({
  reactions,
  currentUserIdentity,
  onReactionToggle,
}: ReactionsDisplayProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat.reactions' })

  const groupedReactions = useMemo((): GroupedReaction[] => {
    const groups: Record<string, GroupedReaction> = {}

    for (const reaction of reactions) {
      if (!groups[reaction.emoji]) {
        groups[reaction.emoji] = {
          emoji: reaction.emoji,
          count: 0,
          participants: [],
          hasCurrentUser: false,
        }
      }
      groups[reaction.emoji].count++
      groups[reaction.emoji].participants.push({
        identity: reaction.participantIdentity,
        name: reaction.participantName,
      })
      if (reaction.participantIdentity === currentUserIdentity) {
        groups[reaction.emoji].hasCurrentUser = true
      }
    }

    return Object.values(groups)
  }, [reactions, currentUserIdentity])

  if (groupedReactions.length === 0) {
    return null
  }

  const getTooltipText = (group: GroupedReaction): string => {
    const names = group.participants
      .slice(0, 3)
      .map((p) => {
        if (p.identity === currentUserIdentity) {
          return t('you')
        }
        return p.name || p.identity
      })
      .join(', ')

    if (group.participants.length > 3) {
      return t('reactedByWithOthers', {
        names,
        count: group.participants.length - 3,
      })
    }
    return t('reactedBy', { names })
  }

  return (
    <div
      className={css({
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.25rem',
        marginTop: '0.25rem',
      })}
    >
      {groupedReactions.map((group) => (
        <Button
          key={group.emoji}
          size="xs"
          variant={group.hasCurrentUser ? 'tertiary' : 'secondaryText'}
          onPress={() => onReactionToggle(group.emoji)}
          aria-label={
            group.hasCurrentUser
              ? t('removeReaction', { emoji: getEmojiLabel(group.emoji, t) })
              : t('addReaction', { emoji: getEmojiLabel(group.emoji, t) })
          }
          tooltip={getTooltipText(group)}
          data-attr={`chat-reaction-badge-${group.emoji}`}
          className={css({
            gap: '0.125rem !important',
            paddingX: '0.25rem !important',
            paddingY: '0.125rem !important',
            minHeight: 'auto',
          })}
        >
          <img
            src={`/assets/reactions/${group.emoji}.png`}
            alt=""
            className={css({
              height: '16px',
              width: '16px',
              pointerEvents: 'none',
              userSelect: 'none',
            })}
          />
          <span
            className={css({
              fontSize: '12px',
              fontWeight: 'medium',
            })}
          >
            {group.count}
          </span>
        </Button>
      ))}
    </div>
  )
}
