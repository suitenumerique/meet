import { useTranslation } from 'react-i18next'
import { useConfig } from '@/api/useConfig'
import { ApiAccessLevel } from '../api/ApiRoom'

/**
 * The access levels this instance lets a room be set to, as radio group items.
 */
export const useAccessLevelItems = () => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'admin',
    useSuspense: false,
  })
  const { data: config } = useConfig()

  const allowPublic = config?.resource?.allow_public_rooms !== false

  return Object.values(ApiAccessLevel)
    .filter((level) => allowPublic || level !== ApiAccessLevel.PUBLIC)
    .map((level) => ({
      value: level,
      label: t(`access.levels.${level}.label`),
      description: t(`access.levels.${level}.description`),
    }))
}
