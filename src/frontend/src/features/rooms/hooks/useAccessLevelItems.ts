import { useTranslation } from 'react-i18next'
import { useConfig } from '@/api/useConfig'
import { ApiAccessLevel } from '../api/ApiRoom'

/**
 * The access levels this instance lets a room be set to, as radio group items.
 *
 * A picker holding a level the list no longer carries selects nothing, which is
 * what asks its owner to choose again.
 */
export const useAccessLevelItems = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'admin' })
  const { data: config } = useConfig()

  const allowed = config?.resource?.allowed_access_levels

  return Object.values(ApiAccessLevel)
    .filter((level) => !allowed || allowed.includes(level))
    .map((level) => ({
      value: level,
      label: t(`access.levels.${level}.label`),
      description: t(`access.levels.${level}.description`),
    }))
}
