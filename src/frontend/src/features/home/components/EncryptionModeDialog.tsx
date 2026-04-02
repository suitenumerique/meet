import { Button, Dialog, type DialogProps, Text } from '@/primitives'
import { VStack, HStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { RiLockFill, RiShieldCheckFill, RiAlertLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { ApiEncryptionMode } from '@/features/rooms/api/ApiRoom'
import { useVaultClient } from '@/features/encryption'

export const EncryptionModeDialog = ({
  onSelect,
  isForLater = false,
  ...dialogProps
}: {
  onSelect: (mode: ApiEncryptionMode) => void
  isForLater?: boolean
} & Omit<DialogProps, 'title'>) => {
  const { t } = useTranslation('home', { keyPrefix: 'encryptionModeDialog' })
  const { hasKeys } = useVaultClient()
  const canUseAdvanced = !!hasKeys

  return (
    <Dialog title={t('title')} isOpen {...dialogProps}>
      <VStack gap="1rem" alignItems="stretch">
        <Text variant="sm" className={css({ color: 'greyscale.700' })}>
          {t('description')}
        </Text>

        <button
          className={css({
            display: 'flex',
            gap: '0.75rem',
            padding: '1rem',
            borderRadius: '0.5rem',
            border: '1px solid',
            borderColor: 'greyscale.200',
            backgroundColor: 'white',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'border-color 150ms ease, background-color 150ms ease',
            _hover: {
              borderColor: 'primary.500',
              backgroundColor: 'primary.50',
            },
          })}
          onClick={() => onSelect(ApiEncryptionMode.BASIC)}
        >
          <div className={css({ flexShrink: 0, paddingTop: '0.15rem' })}>
            <RiLockFill size={20} color="#2563eb" />
          </div>
          <VStack gap="0.25rem" alignItems="flex-start">
            <Text
              variant="sm"
              bold
              className={css({ color: 'greyscale.900' })}
            >
              {t('basic.title')}
            </Text>
            <Text variant="sm" className={css({ color: 'greyscale.600' })}>
              {t('basic.description')}
            </Text>
          </VStack>
        </button>

        <div style={{ position: 'relative' }}>
          <button
            className={css({
              display: 'flex',
              gap: '0.75rem',
              padding: '1rem',
              borderRadius: '0.5rem',
              border: '1px solid',
              borderColor: 'greyscale.200',
              backgroundColor: 'white',
              cursor: canUseAdvanced ? 'pointer' : 'not-allowed',
              textAlign: 'left',
              opacity: canUseAdvanced ? 1 : 0.5,
              transition:
                'border-color 150ms ease, background-color 150ms ease',
              _hover: canUseAdvanced
                ? {
                    borderColor: 'green.500',
                    backgroundColor: 'green.50',
                  }
                : {},
            })}
            onClick={() => canUseAdvanced && onSelect(ApiEncryptionMode.ADVANCED)}
            disabled={!canUseAdvanced}
          >
            <div className={css({ flexShrink: 0, paddingTop: '0.15rem' })}>
              <RiShieldCheckFill
                size={20}
                color={canUseAdvanced ? '#166534' : '#9ca3af'}
              />
            </div>
            <VStack gap="0.25rem" alignItems="flex-start">
              <Text
                variant="sm"
                bold
                className={css({
                  color: canUseAdvanced ? 'greyscale.900' : 'greyscale.400',
                })}
              >
                {t('advanced.title')}
              </Text>
              <Text
                variant="sm"
                className={css({
                  color: canUseAdvanced ? 'greyscale.600' : 'greyscale.400',
                })}
              >
                {t('advanced.description')}
              </Text>
            </VStack>
          </button>
          {!canUseAdvanced && (
            <HStack
              gap="0.4rem"
              className={css({
                marginTop: '0.5rem',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'orange.50',
                borderRadius: '0.375rem',
              })}
            >
              <RiAlertLine
                size={14}
                color="#d97706"
                className={css({ flexShrink: 0 })}
              />
              <Text variant="note" className={css({ color: 'orange.800' })}>
                {t('advanced.onboardingRequired')}
              </Text>
            </HStack>
          )}
        </div>
      </VStack>
    </Dialog>
  )
}
