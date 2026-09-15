import { useTranslation } from 'react-i18next'
import { ApiAccessLevel } from '../api/ApiRoom'
import { useAllowPublicRooms } from './useAllowPublicRooms'

/**
 * The access levels this instance lets a room be set to, as radio group items.
 */
export const useAccessLevelItems = () => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'admin',
    useSuspense: false,
  })
  const allowPublic = useAllowPublicRooms()

  return Object.values(ApiAccessLevel)
    .filter((level) => allowPublic || level !== ApiAccessLevel.PUBLIC)
    .map((level) => ({
      value: level,
      label: t(`access.levels.${level}.label`),
      description: t(`access.levels.${level}.description`),
    }))
}
