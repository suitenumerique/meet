import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  convertToBackendLanguage,
  convertToFrontendLanguage,
} from '@/utils/languages'
import { useUser } from './useUser'
import { usePatchUserPreferences, type PatchUserParams } from './patchUser'

/**
 * Applies the saved language on load. The browser language is saved only
 * while the user has none yet; after that, only the language picker writes it.
 */
export const useSyncUserPreferencesWithBackend = () => {
  const { i18n } = useTranslation()
  const { user } = useUser()
  const syncedUserId = useRef<string>()
  const { mutate } = usePatchUserPreferences()

  useEffect(() => {
    if (!user || syncedUserId.current === user.id) return
    syncedUserId.current = user.id

    const changes: PatchUserParams['user'] = {}

    if (user.language) {
      const savedLanguage = convertToFrontendLanguage(user.language)
      if (savedLanguage && savedLanguage !== i18n.language) {
        i18n.changeLanguage(savedLanguage)
      }
    } else {
      changes.language = convertToBackendLanguage(i18n.language)
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timezone !== user.timezone) changes.timezone = timezone

    if (Object.keys(changes).length) {
      mutate({ userId: user.id, user: changes })
    }
  }, [user, i18n, mutate])
}
