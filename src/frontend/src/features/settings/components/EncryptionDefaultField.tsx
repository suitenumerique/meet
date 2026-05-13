/**
 * "Encrypt new meetings by default" toggle used both in the in-meeting
 * Security tab and the home-page SettingsDialog. Flipping it directly
 * patches the user preference — the per-meeting CreateEncryptedMeeting
 * dialog already surfaces the disabled-features warning when needed.
 */
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { A, Field, Text } from '@/primitives'
import { useUser } from '@/features/auth'
import { updateUserPreferences } from '@/features/auth/api/updateUserPreferences'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'
import { useConfig } from '@/api/useConfig'
import { LoginButton } from '@/components/LoginButton'
import { ApiEncryptionMode } from '@/features/rooms/api/ApiRoom'

export const EncryptionDefaultField = () => {
  const { t } = useTranslation('settings', { keyPrefix: 'security' })
  const { user, isLoggedIn } = useUser()
  const { data: config } = useConfig()
  const isFeatureEnabled = !!config?.encryption?.enabled

  const { mutateAsync, isPending } = useMutation({
    mutationFn: updateUserPreferences,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData([keys.user], updatedUser)
    },
  })

  const isOn = user?.default_encryption_mode === ApiEncryptionMode.BASIC

  const handleToggle = (next: boolean) => {
    if (!user) return
    void mutateAsync({
      user: {
        id: user.id,
        default_encryption_mode: next
          ? ApiEncryptionMode.BASIC
          : ApiEncryptionMode.NONE,
      },
    })
  }

  if (!isLoggedIn) {
    return (
      <>
        <Text variant="note" margin={false}>
          {t('signInRequired')}
        </Text>
        <LoginButton />
      </>
    )
  }

  if (!isFeatureEnabled) {
    return (
      <Text variant="note" margin={false}>
        {t('featureDisabled')}
      </Text>
    )
  }

  return (
    <Field
      type="switch"
      label={t('encryption.label')}
      description={
        <>
          {t('encryption.description')}{' '}
          {config?.support?.help_article_encryption && (
            <A
              href={config.support.help_article_encryption}
              target="_blank"
              rel="noopener noreferrer"
              externalIcon
              color="note"
            >
              {t('encryption.learnMore')}
            </A>
          )}
        </>
      }
      isSelected={isOn}
      isDisabled={isPending}
      onChange={handleToggle}
      wrapperProps={{ noMargin: true, fullWidth: true }}
    />
  )
}
