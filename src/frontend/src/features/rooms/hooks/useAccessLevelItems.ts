import { useTranslation } from 'react-i18next'
import { ApiAccessLevel } from '../api/ApiRoom'
import { useAllowPublicRooms } from './useAllowPublicRooms'

/**
 * The access levels this instance lets a room be set to, as radio group items.
 * The open level waits for the configuration: unread, it is not offered, since
 * the backend refuses a level it has not said it allows.
 */
export const useAccessLevelItems = () => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'admin',
    useSuspense: false,
  })
  const allowPublic = useAllowPublicRooms()

  return Object.values(ApiAccessLevel)
    .filter((level) => level !== ApiAccessLevel.PUBLIC || allowPublic === true)
    .map((level) => ({
      value: level,
      label: t(`access.levels.${level}.label`),
      description: t(`access.levels.${level}.description`),
    }))
}
