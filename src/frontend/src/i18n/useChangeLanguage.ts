import { useTranslation } from 'react-i18next'
import { usePatchUserPreferences } from '@/features/auth/api/patchUser'
import { useUser } from '@/features/auth/api/useUser'
import { convertToBackendLanguage } from '@/utils/languages'

export const useChangeLanguage = () => {
  const { i18n } = useTranslation()
  const { user } = useUser()
  const { mutate } = usePatchUserPreferences()

  return (language: string) => {
    i18n.changeLanguage(language)
    if (user) {
      mutate({
        userId: user.id,
        user: { language: convertToBackendLanguage(language) },
      })
    }
  }
}
