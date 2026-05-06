/**
 * Modal asking the admin to confirm that they accept pausing encryption
 * to start recording or transcription.
 */
import { Button, Dialog, Text } from '@/primitives'
import { HStack, VStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'

interface Props {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  reason: 'recording' | 'transcript'
  onConfirm: () => void | Promise<void>
}

export function PauseEncryptionConfirmDialog({
  isOpen,
  onOpenChange,
  reason,
  onConfirm,
}: Props) {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'encryption.pauseConfirm',
  })

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      role="dialog"
      type="flex"
      title={t(`title.${reason}`)}
    >
      <VStack
        alignItems="start"
        gap="0.75rem"
        className={css({ maxWidth: '24rem' })}
      >
        <Text variant="sm">{t('description')}</Text>
        <Text
          variant="note"
          className={css({
            fontSize: '0.8rem',
            color: 'greyscale.500',
          })}
        >
          {t('learnMore')}
        </Text>
        <HStack gap="0.5rem" justify="end" className={css({ width: '100%' })}>
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            onPress={async () => {
              await onConfirm()
              onOpenChange(false)
            }}
          >
            {t(`confirm.${reason}`)}
          </Button>
        </HStack>
      </VStack>
    </Dialog>
  )
}
