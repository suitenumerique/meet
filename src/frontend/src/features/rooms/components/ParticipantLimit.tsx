import { useTranslation } from 'react-i18next'
import { P } from '@/primitives'
import { useConfig } from '@/api/useConfig'

export const ParticipantLimit = () => {
  const { t } = useTranslation('rooms')
  const { data } = useConfig()
  const limit = data?.room_max_participants
  if (!limit) return null
  return <P>{t('participantLimit', { count: limit })}</P>
}
