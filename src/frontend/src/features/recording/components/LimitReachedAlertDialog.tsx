import { useTranslation } from 'react-i18next'
import { Button, Dialog, P } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { useHumanizeRecordingMaxDuration } from '@/features/recording'

export const LimitReachedAlertDialog = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'recordingStateToast.limitReachedAlert',
  })

  const maxDuration = useHumanizeRecordingMaxDuration()

  return (
    <Dialog isOpen={isOpen} role="alertdialog" title={t('title')}>
      <P>
        {t('description', {
          duration_message: maxDuration
            ? t('durationMessage', {
                duration: maxDuration,
              })
            : '',
        })}
      </P>
      <HStack gap={1}>
        <Button variant="text" size="sm" onPress={onClose}>
          {t('button')}
        </Button>
      </HStack>
    </Dialog>
  )
}
