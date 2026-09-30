import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { Text } from '@/primitives'
import { useJoinParticipants } from '../hooks/useJoinParticipants'

/**
 * Isolated from the join form so the poll re-renders these lines alone, and
 * memoised so a keystroke in the name field does not re-render them.
 */
export const JoinParticipants = memo(({ roomId }: { roomId: string }) => {
  const { t, i18n } = useTranslation('rooms', {
    keyPrefix: 'join.participants',
  })
  const participants = useJoinParticipants(roomId)

  if (!participants) {
    return null
  }

  const { count, names } = participants
  const unnamed = (count ?? 0) - names.length

  let summary
  if (count === null) summary = t('started')
  else if (count === 0) summary = t('empty')
  else summary = t('count', { count })

  // <output> is a live region already, so a screen reader reads these lines
  // again when the meeting changes, without announcing a form value.
  return (
    <output
      className={css({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
      })}
    >
      <Text as="span" variant="note" centered margin="sm">
        {summary}
      </Text>
      {names.length > 0 && (
        <Text as="span" variant="note" centered margin="sm">
          {/* Intl joins the names in the reader's own language, so the word
            before the last one is never translated here. */}
          {new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(
            unnamed > 0 ? [...names, t('more', { count: unnamed })] : names
          )}
        </Text>
      )}
    </output>
  )
})
JoinParticipants.displayName = 'JoinParticipants'
