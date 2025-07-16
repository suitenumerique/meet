import { useTranslation } from 'react-i18next'
import { Button, Dialog, P } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { useConfig } from '@/api/useConfig'
import humanizeDuration from 'humanize-duration'

export const LimitReachedAlertDialog = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) => {
  const { t, i18n } = useTranslation('rooms', {
    keyPrefix: 'recordingStateToast.limitReachedAlert',
  })
  const { data } = useConfig()
  return (
    <Dialog isOpen={isOpen} role="alertdialog" title={t('title')}>
      <P>
        {t('description', {
          duration_message: data?.recording?.max_duration
            ? t('durationMessage', {
                duration: humanizeDuration(data?.recording?.max_duration, {
                  language: i18n.language,
                }),
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
