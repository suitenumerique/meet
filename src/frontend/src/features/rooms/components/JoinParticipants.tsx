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
  // Everyone the line leaves out: those the endpoint capped, and those who
  // gave no name to show.
  const notShown = count - names.length

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
        {count === 0 ? t('empty') : t('count', { count })}
      </Text>
      {names.length > 0 && (
        <Text as="span" variant="note" centered margin="sm">
          {/* Intl joins the names in the reader's own language, so the word
            before the last one is never translated here. */}
        {new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(
          notShown > 0 ? [...names, t('more', { count: notShown })] : names
        )}
        </Text>
      )}
    </output>
  )
})
JoinParticipants.displayName = 'JoinParticipants'
