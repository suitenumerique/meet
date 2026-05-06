/**
 * Modal explaining encryption trust levels.
 * Shown when admin clicks the trust badge in the waiting room.
 */
import { css } from '@/styled-system/css'
import { VStack, HStack } from '@/styled-system/jsx'
import { Dialog, Text } from '@/primitives'
import { RiShieldCheckFill, RiShieldCheckLine, RiAlertLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'

interface EncryptionTrustModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  participantName: string
  isAuthenticated: boolean
}

export function EncryptionTrustModal({
  isOpen,
  onOpenChange,
  participantName,
  isAuthenticated,
}: EncryptionTrustModalProps) {
  const { t } = useTranslation('rooms', { keyPrefix: 'encryption.trustModal' })

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      role="dialog"
      type="flex"
      title={t('title')}
    >
      <VStack
        gap="1rem"
        alignItems="start"
        className={css({ maxWidth: '22rem' })}
      >
        <Text variant="sm">{t('intro', { name: participantName })}</Text>

        {isAuthenticated ? (
          <HStack
            gap="0.75rem"
            className={css({
              backgroundColor: '#eff6ff',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              width: '100%',
              border: '1px solid #bfdbfe',
            })}
          >
            <RiShieldCheckLine
              size={24}
              color="#3b82f6"
              className={css({ flexShrink: 0 })}
            />
            <VStack gap="0.25rem" alignItems="start">
              <Text className={css({ fontWeight: 600, fontSize: '0.85rem' })}>
                {t('authenticated.title')}
              </Text>
              <Text variant="note" className={css({ fontSize: '0.8rem' })}>
                {t('authenticated.description')}
              </Text>
            </VStack>
          </HStack>
        ) : (
          <HStack
            gap="0.75rem"
            className={css({
              backgroundColor: '#fffbeb',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              width: '100%',
              border: '1px solid #fde68a',
            })}
          >
            <RiAlertLine
              size={24}
              color="#f59e0b"
              className={css({ flexShrink: 0 })}
            />
            <VStack gap="0.25rem" alignItems="start">
              <Text className={css({ fontWeight: 600, fontSize: '0.85rem' })}>
                {t('anonymous.title')}
              </Text>
              <Text variant="note" className={css({ fontSize: '0.8rem' })}>
                {t('anonymous.description')}
              </Text>
            </VStack>
          </HStack>
        )}

        <VStack
          gap="0.5rem"
          alignItems="start"
          className={css({
            borderTop: '1px solid',
            borderColor: 'greyscale.200',
            paddingTop: '0.75rem',
            width: '100%',
          })}
        >
          <Text
            variant="note"
            className={css({ fontWeight: 600, fontSize: '0.8rem' })}
          >
            {t('levels.title')}
          </Text>
          <HStack gap="0.5rem" alignItems="start">
            <RiShieldCheckFill
              size={16}
              color="#22c55e"
              className={css({ flexShrink: 0, marginTop: '2px' })}
            />
            <Text variant="note" className={css({ fontSize: '0.75rem' })}>
              {t('levels.verified')}
            </Text>
          </HStack>
          <HStack gap="0.5rem" alignItems="start">
            <RiShieldCheckLine
              size={16}
              color="#3b82f6"
              className={css({ flexShrink: 0, marginTop: '2px' })}
            />
            <Text variant="note" className={css({ fontSize: '0.75rem' })}>
              {t('levels.authenticated')}
            </Text>
          </HStack>
          <HStack gap="0.5rem" alignItems="start">
            <RiAlertLine
              size={16}
              color="#f59e0b"
              className={css({ flexShrink: 0, marginTop: '2px' })}
            />
            <Text variant="note" className={css({ fontSize: '0.75rem' })}>
              {t('levels.anonymous')}
            </Text>
          </HStack>
        </VStack>
      </VStack>
    </Dialog>
  )
}
