import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/primitives'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { recordingStore } from '@/stores/recording'

export const ErrorAlertDialog = () => {
  const recordingSnap = useSnapshot(recordingStore)
  const { t } = useTranslation('rooms', {
    keyPrefix: 'errorRecordingAlertDialog',
  })

  return (
    <Dialog
      isOpen={!!recordingSnap.isErrorDialogOpen}
      role="alertdialog"
      type="alert"
    >
      <DialogTitle>{t('title')}</DialogTitle>
      <DialogBody>
        <p>{t(`body.${recordingSnap.isErrorDialogOpen}`)}</p>
      </DialogBody>
      <DialogActions>
        <Button
          variant="primary"
          size="sm"
          onPress={() => (recordingStore.isErrorDialogOpen = '')}
        >
          {t('button')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
