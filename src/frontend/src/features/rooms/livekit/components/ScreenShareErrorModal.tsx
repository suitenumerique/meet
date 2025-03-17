import { A, Button, Dialog, P } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'

// todo - refactor it into a generic system
export const ScreenShareErrorModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'error.screenShare' })
  const isMac = navigator.userAgent.toLowerCase().indexOf('mac') !== -1

  return (
    <Dialog
      isOpen={isOpen}
      role="alertdialog"
      title={t('title')}
      aria-label={t('ariaLabel')}
      onClose={onClose}
    >
      {({ close }) => {
        return (
          <>
            <P>
              {t('message')}{' '}
              {isMac && (
                <>
                  {t('macInstructions')}{' '}
                  <A
                    href="x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
                    color="primary"
                    aria-label={t('macSystemPreferences') + '-' + t('newTab')}
                  >
                    {t('macSystemPreferences')}
                  </A>
                  .{' '}
                </>
              )}
              {t('helpLinkText')}{' '}
              <A
                href="https://lasuite.crisp.help/fr/article/visio-probleme-de-presentation-1xkf799/"
                aria-label={t('helpLinkLabel') + '-' + t('newTab')}
                target="_blank"
                color="primary"
              >
                {t('helpLinkLabel')}
              </A>
              .
            </P>
            <Button
              onPress={close}
              size="sm"
              variant="primary"
              className={css({ marginLeft: 'auto', marginTop: '2rem' })}
            >
              {t('closeButton')}
            </Button>
          </>
        )
      }}
    </Dialog>
  )
}
