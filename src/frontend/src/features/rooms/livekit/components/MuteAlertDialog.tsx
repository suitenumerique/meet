import { useTranslation } from 'react-i18next'
import { Button, Dialog, P } from '@/primitives'
import { HStack } from '@/styled-system/jsx'

export const MuteAlertDialog = ({
  isOpen,
  onClose,
  onSubmit,
  name,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: () => void
  name: string
}) => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'participants.muteParticipantAlert',
  })
  return (
    <Dialog
      isOpen={isOpen}
      role="alertdialog"
      aria-label={t('heading', { name })}
    >
      <P>{t('description', { name })}</P>
      <HStack gap="base">
        <Button variant="text" size="sm" onPress={onClose}>
          {t('cancel')}
        </Button>
        <Button variant="text" size="sm" onPress={onSubmit}>
          {t('confirm')}
        </Button>
      </HStack>
    </Dialog>
  )
}
