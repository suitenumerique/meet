import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { Emoji } from '../../types'
import { useReactions } from '../../hooks/useReactions'
import { Button } from '@/primitives'

export const ReactionButton = ({ emoji }: { emoji: Emoji }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })
  const { sendReaction } = useReactions()
  return (
    <Button
      onPress={() => sendReaction(emoji)}
      aria-label={t(`emojis.${emoji}`)}
      variant="primaryTextDark"
      size="sm"
      round
      data-attr={`send-reaction-${emoji}`}
    >
      <img
        src={`/assets/reactions/${emoji}.png`}
        alt=""
        className={css({
          width: '28px',
          height: '28px',
          pointerEvents: 'none',
          userSelect: 'none',
        })}
      />
    </Button>
  )
}
