import { A, Button, Dialog, P } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { getOS, type OS } from '@/utils/os'

const SCREEN_CAPTURE_SETTINGS_LINKS: Partial<Record<OS, string>> = {
  macos:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  windows: 'ms-settings:privacy-graphicscaptureprogrammatic',
}

// todo - refactor it into a generic system
export const ScreenShareErrorModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'error.screenShare' })
  const os = getOS()
  const settingsHref = SCREEN_CAPTURE_SETTINGS_LINKS[os]

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
              {settingsHref && (
                <>
                  {t('settingsInstructions')}{' '}
                  <A
                    href={settingsHref}
                    target="_blank"
                    color="primary"
                    aria-label={t(`settingsLabel.${os}`) + '-' + t('newTab')}
                  >
                    {t(`settingsLabel.${os}`)}
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
