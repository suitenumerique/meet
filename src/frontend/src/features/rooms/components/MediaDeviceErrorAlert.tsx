import type { MediaDeviceFailure } from 'livekit-client'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/primitives'

export type MediaDeviceErrorAlertProps = {
  error?: MediaDeviceFailure | null
  kind?: MediaDeviceKind | null
  onClose: () => void
}

export const MediaDeviceErrorAlert = ({
  error,
  kind,
  onClose,
}: MediaDeviceErrorAlertProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'mediaErrorDialog' })

  if (!error || !kind) return

  return (
    <Dialog role="alertdialog" type="alert" isOpen={!!error} onClose={onClose}>
      <DialogTitle>{t(`${error}.title.${kind}`)}</DialogTitle>
      <DialogBody>
        <p>{t(`${error}.body.${kind}`)}</p>
      </DialogBody>
      <DialogActions>
        <Button variant="primary" size="sm" onPress={onClose}>
          {t('close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
