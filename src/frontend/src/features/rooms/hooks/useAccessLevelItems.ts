import { useTranslation } from 'react-i18next'
import { useConfig } from '@/api/useConfig'
import { ApiAccessLevel } from '../api/ApiRoom'

/**
 * The access levels this instance lets a room be set to, as radio group items.
 *
 * `current` is kept in the list whatever the instance allows, so a room or a
 * user preference saved before the list narrowed still renders its own value.
 */
export const useAccessLevelItems = (current?: ApiAccessLevel) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'admin' })
  const { data: config } = useConfig()

  const allowed = config?.resource?.allowed_access_levels

  return Object.values(ApiAccessLevel)
    .filter((level) => !allowed || allowed.includes(level) || level === current)
    .map((level) => ({
      value: level,
      label: t(`access.levels.${level}.label`),
      description: t(`access.levels.${level}.description`),
    }))
}
