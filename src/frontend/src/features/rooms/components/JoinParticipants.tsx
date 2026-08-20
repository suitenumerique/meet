import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { Text } from '@/primitives'
import { useJoinParticipants } from '../hooks/useJoinParticipants'

// Past this many, the roster stops being a sentence and becomes a wall.
const MAX_NAMES = 5

/**
 * Isolated from the join form so the poll re-renders these lines alone, and
 * never the name field someone is typing in.
 */
export const JoinParticipants = ({ roomId }: { roomId: string }) => {
  const { t, i18n } = useTranslation('rooms', {
    keyPrefix: 'join.participants',
  })
  const participants = useJoinParticipants(roomId)

  if (!participants) {
    return null
  }

  const { count, names } = participants
  const shown = names.slice(0, MAX_NAMES)
  // Everyone the line leaves out: those past the cap, and those who gave no
  // name to show.
  const notShown = count - shown.length
  // Intl builds the list in the reader's own language, so the word joining the
  // last two names never has to be translated here.
  const listed = new Intl.ListFormat(i18n.language, {
    type: 'conjunction',
  }).format(notShown > 0 ? [...shown, t('more', { count: notShown })] : shown)

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
      {shown.length > 0 && (
        <Text as="span" variant="note" centered margin="sm">
          {listed}
        </Text>
      )}
    </output>
  )
}
