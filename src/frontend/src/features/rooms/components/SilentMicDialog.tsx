import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { css } from '@/styled-system/css'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogDismissButton,
  DialogTitle,
} from '@/primitives'
import {
  closeSilentMicDialog,
  discardSilentMicDetection,
  silentMicStore,
} from '@/stores/silentMic'

/**
 * Opened from the "!" badge on the microphone toggle when the silent-mic
 * check tripped (see stores/silentMic.ts). Explains the likely causes
 * and lets the user opt out of the detection for good.
 */
export const SilentMicDialog = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'silentMic.dialog' })
  const { isDialogOpen } = useSnapshot(silentMicStore)

  return (
    <Dialog
      isOpen={isDialogOpen}
      role="dialog"
      type="flex"
      onClose={closeSilentMicDialog}
    >
      <div
        className={css({
          maxWidth: '500px',
        })}
      >
        <DialogTitle className={css({ paddingRight: '2rem' })}>
          {t('title')}
        </DialogTitle>
        <DialogBody>
          <p>{t('intro')}</p>
          <ul>
            <li>{t('causes.system')}</li>
            <li>{t('causes.hardware')}</li>
            <li>{t('causes.wrongDevice')}</li>
          </ul>
          <p>{t('hint')}</p>
        </DialogBody>
        <DialogActions>
          <DialogDismissButton onPress={discardSilentMicDetection}>
            {t('discard')}
          </DialogDismissButton>
          <Button variant="primary" size="sm" onPress={closeSilentMicDialog}>
            {t('close')}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  )
}
