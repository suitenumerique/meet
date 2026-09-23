import { Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { ApiAccessLevel } from '@/features/rooms/api/ApiRoom'

/**
 * Tells the host the meeting does not run at the level they stored, because the
 * instance no longer allows it. Rendered only where the API reports it.
 */
export const EnforcedAccessLevelNotice = ({
  level,
}: {
  level: ApiAccessLevel
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'admin' })

  return (
    <Text
      role="status"
      variant="warning"
      wrap="pretty"
      className={css({ textStyle: 'sm' })}
      margin={'md'}
    >
      {t('access.enforced', {
        level: t(`access.levels.${level}.label`),
      })}
    </Text>
  )
}
