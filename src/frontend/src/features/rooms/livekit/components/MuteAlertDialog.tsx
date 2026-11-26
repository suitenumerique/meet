import { useTranslation } from 'react-i18next'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogDismissButton,
  DialogTitle,
} from '@/primitives'

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
    <Dialog isOpen={isOpen} role="alertdialog" type="alert">
      <DialogTitle>{t('heading', { name })}</DialogTitle>
      <DialogBody>
        <p>{t('description', { name })}</p>
      </DialogBody>
      <DialogActions>
        <DialogDismissButton onPress={onClose}>
          {t('cancel')}
        </DialogDismissButton>
        <Button variant="primary" size="sm" onPress={onSubmit}>
          {t('confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
