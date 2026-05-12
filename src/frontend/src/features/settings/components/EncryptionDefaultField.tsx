/**
 * Reusable "create encrypted meetings by default" toggle + confirmation
 * dialog. Used both in the in-meeting Security tab and the home-page
 * SettingsDialog so the option is reachable from outside a call.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import {
  RiFileTextLine,
  RiPhoneLine,
  RiRecordCircleLine,
  RiVideoOnLine,
} from '@remixicon/react'
import { Button, Dialog, Field, Text } from '@/primitives'
import { HStack, VStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { useUser } from '@/features/auth'
import { updateUserPreferences } from '@/features/auth/api/updateUserPreferences'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'
import { useConfig } from '@/api/useConfig'
import { LoginButton } from '@/components/LoginButton'

export const EncryptionDefaultField = () => {
  const { t } = useTranslation('settings', { keyPrefix: 'security' })
  const { user, isLoggedIn } = useUser()
  const { data: config } = useConfig()
  const isFeatureEnabled = !!config?.encryption?.enabled
  const [confirmTarget, setConfirmTarget] = useState<boolean | null>(null)

  const { mutateAsync, isPending } = useMutation({
    mutationFn: updateUserPreferences,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData([keys.user], updatedUser)
    },
  })

  const isOn = !!user?.default_encryption

  const requestToggle = (next: boolean) => {
    if (!user) return
    if (next) {
      setConfirmTarget(true)
      return
    }
    void mutateAsync({ user: { id: user.id, default_encryption: false } })
  }

  const confirm = async () => {
    if (!user || confirmTarget === null) return
    await mutateAsync({
      user: { id: user.id, default_encryption: confirmTarget },
    })
    setConfirmTarget(null)
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
    <>
      <Field
        type="switch"
        label={t('toggle.label')}
        description={t('toggle.description')}
        isSelected={isOn}
        isDisabled={isPending}
        onChange={requestToggle}
        wrapperProps={{ noMargin: true, fullWidth: true }}
      />
      <Dialog
        isOpen={confirmTarget !== null}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        role="dialog"
        type="flex"
        title={t('confirmModal.title')}
      >
        <VStack
          alignItems="start"
          gap="0.75rem"
          className={css({ maxWidth: '24rem' })}
        >
          <Text variant="sm">{t('confirmModal.description')}</Text>
          <VStack gap="0.5rem" alignItems="start">
            <ConfirmRow
              icon={<RiPhoneLine size={16} />}
              label={t('confirmModal.items.phone')}
            />
            <ConfirmRow
              icon={<RiVideoOnLine size={16} />}
              label={t('confirmModal.items.devices')}
            />
            <ConfirmRow
              icon={<RiFileTextLine size={16} />}
              label={t('confirmModal.items.transcription')}
            />
            <ConfirmRow
              icon={<RiRecordCircleLine size={16} />}
              label={t('confirmModal.items.recording')}
            />
          </VStack>
          <Text
            variant="note"
            className={css({ fontSize: '0.8rem', color: 'greyscale.500' })}
          >
            {t('confirmModal.footnote')}
          </Text>
          <HStack gap="0.5rem" justify="end" className={css({ width: '100%' })}>
            <Button
              variant="secondary"
              onPress={() => setConfirmTarget(null)}
            >
              {t('confirmModal.cancel')}
            </Button>
            <Button
              variant="primary"
              isDisabled={isPending}
              onPress={confirm}
            >
              {t('confirmModal.confirm')}
            </Button>
          </HStack>
        </VStack>
      </Dialog>
    </>
  )
}

const ConfirmRow = ({
  icon,
  label,
}: {
  icon: React.ReactNode
  label: string
}) => (
  <HStack gap="0.5rem" alignItems="center">
    <span className={css({ color: 'greyscale.600' })}>{icon}</span>
    <Text variant="sm" margin={false}>
      {label}
    </Text>
  </HStack>
)
