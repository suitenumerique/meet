import { Button, Dialog, P } from '@/primitives'
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
      title={t('title')}
      aria-label={t('title')}
    >
      <P>{t(`body.${recordingSnap.isErrorDialogOpen}`)}</P>
      <Button
        variant="text"
        size="sm"
        onPress={() => (recordingStore.isErrorDialogOpen = '')}
      >
        {t('button')}
      </Button>
    </Dialog>
  )
}
