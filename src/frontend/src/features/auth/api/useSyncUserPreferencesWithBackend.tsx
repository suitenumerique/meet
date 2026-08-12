import { useMutation } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { queryClient } from '@/api/queryClient'
import { updateUserPreferences } from './updateUserPreferences'
import {
  convertToBackendLanguage,
  convertToFrontendLanguage,
  type BackendLanguage,
} from '@/utils/languages'
import { useUser } from './useUser'

/**
 * Synchronizes user preferences with the backend. The saved language is the
 * source of truth: it is adopted into the UI on load and only pushed back when
 * the user changes it in the settings panel. Timezone follows the browser.
 */
export const useSyncUserPreferencesWithBackend = () => {
  const { i18n } = useTranslation()
  const { user, isLoggedIn } = useUser()

  const lastServerLanguage = useRef<BackendLanguage | null>(null)

  const { mutate } = useMutation({
    mutationFn: updateUserPreferences,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData([keys.user], updatedUser)
      lastServerLanguage.current = updatedUser.language
    },
    onError: (error) => {
      console.error(error)
    },
  })

  useEffect(() => {
    if (!user || !isLoggedIn || !user.language) return

    const serverLang = user.language
    const frontendServerLang = convertToFrontendLanguage(serverLang)

    if (lastServerLanguage.current !== serverLang) {
      lastServerLanguage.current = serverLang
      if (frontendServerLang && frontendServerLang !== i18n.language) {
        i18n.changeLanguage(frontendServerLang)
        return
      }
    }

    const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const uiLang = convertToBackendLanguage(i18n.language)
    const languageChanged =
      !!frontendServerLang && !!uiLang && uiLang !== serverLang
    const timezoneChanged = currentTimezone !== user.timezone

    if (!languageChanged && !timezoneChanged) return

    mutate({
      user: {
        id: user.id,
        timezone: currentTimezone,
        language: languageChanged ? uiLang : serverLang,
      },
    })
  }, [i18n, i18n.language, isLoggedIn, user, mutate])
}
