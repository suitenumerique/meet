import { useTranslation } from 'react-i18next'
import { Text } from '@/primitives'
import { useParticipantsCount } from '../hooks/useParticipantsCount'

/**
 * Isolated from the join form so the poll re-renders this line alone, and never
 * the name field someone is typing in.
 */
export const JoinParticipantsCount = ({ roomId }: { roomId: string }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'join.participants' })
  const count = useParticipantsCount(roomId)

  if (count === undefined) {
    return null
  }

  return (
    <Text as="p" variant="note" centered role="status" margin="sm">
      {count === 0 ? t('empty') : t('count', { count })}
    </Text>
  )
}
