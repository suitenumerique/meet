import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { css } from '@/styled-system/css'
import { Button, Dialog, H, P } from '@/primitives'
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
      title=""
      aria-label={t('title')}
      onClose={closeSilentMicDialog}
    >
      <div
        className={css({
          maxWidth: '500px',
        })}
      >
        <H lvl={1}>{t('title')}</H>
        <P>{t('intro')}</P>
        <ul className={css({ listStyle: 'disc', paddingLeft: '24px' })}>
          <li>{t('causes.system')}</li>
          <li>{t('causes.hardware')}</li>
          <li>{t('causes.wrongDevice')}</li>
        </ul>
        <P>{t('hint')}</P>
        <div
          className={css({
            marginTop: '1.5rem',
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
          })}
        >
          <Button variant="primary" size="sm" onPress={closeSilentMicDialog}>
            {t('close')}
          </Button>
          <Button
            variant="tertiary"
            size="sm"
            onPress={discardSilentMicDetection}
          >
            {t('discard')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
