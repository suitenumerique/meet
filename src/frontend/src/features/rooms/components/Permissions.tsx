import { useWatchPermissions } from '@/features/rooms/hooks/useWatchPermissions'
import { css } from '@/styled-system/css'
import { Dialog, H } from '@/primitives'
import { RiEqualizer2Line } from '@remixicon/react'
import { useEffect, useMemo } from 'react'
import { useSnapshot } from 'valtio'
import { closePermissionsDialog, permissionsStore } from '@/stores/permissions'
import { useTranslation } from 'react-i18next'
import { injectIconIntoTranslation } from '@/utils/translation'
import { isSafari } from '@/utils/livekit'

/**
 * Singleton component - ensures permissions sync runs only once across the app.
 * WARNING: This component should only be instantiated once in the interface.
 * Multiple instances may cause unexpected behavior or performance issues.
 */
export const Permissions = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'permissionErrorDialog' })

  useWatchPermissions()

  const permissions = useSnapshot(permissionsStore)

  const permissionLabel = useMemo(() => {
    if (permissions.isMicrophoneDenied && permissions.isCameraDenied) {
      return 'cameraAndMicrophone'
    } else if (permissions.isCameraDenied) {
      return 'camera'
    } else if (permissions.isMicrophoneDenied) {
      return 'microphone'
    } else {
      return 'default'
    }
  }, [permissions])

  const [descriptionBeforeIcon, descriptionAfterIcon] =
    injectIconIntoTranslation(t('body.openMenu.others'))

  useEffect(() => {
    if (
      permissions.isPermissionDialogOpen &&
      permissions.isMicrophoneGranted &&
      permissions.requestOrigin == 'audioinput'
    ) {
      closePermissionsDialog()
    }

    if (
      permissions.isPermissionDialogOpen &&
      permissions.isCameraGranted &&
      permissions.requestOrigin == 'videoinput'
    ) {
      closePermissionsDialog()
    }

    if (
      permissions.isPermissionDialogOpen &&
      permissions.isCameraGranted &&
      permissions.isMicrophoneGranted
    ) {
      closePermissionsDialog()
    }
  }, [permissions])

  const appTitle = `${import.meta.env.VITE_APP_TITLE}`

  return (
    <Dialog
      isOpen={permissions.isPermissionDialogOpen}
      role="dialog"
      type="flex"
      title=""
      aria-label={t(`heading.${permissionLabel}`, {
        appTitle,
      })}
      onClose={closePermissionsDialog}
    >
      <div
        className={css({
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          md: {
            flexDirection: 'row',
          },
        })}
      >
        <img
          src="/assets/camera_mic_permission.svg"
          alt=""
          className={css({
            width: '100%',
            minHeight: '290px',
            maxWidth: '290px',
          })}
        />
        <div
          className={css({
            maxWidth: '400px',
          })}
        >
          <H lvl={2}>
            {t(`heading.${permissionLabel}`, {
              appTitle,
            })}
          </H>
          <ol className={css({ listStyle: 'decimal', paddingLeft: '24px' })}>
            <li>
              {isSafari() ? (
                t('body.openMenu.safari', {
                  appDomain: window.origin.replace('https://', ''),
                })
              ) : (
                <>
                  {descriptionBeforeIcon}
                  <span
                    style={{ display: 'inline-block', verticalAlign: 'middle' }}
                  >
                    <RiEqualizer2Line />
                  </span>
                  {descriptionAfterIcon}
                </>
              )}
            </li>
            <li>{t(`body.details.${permissionLabel}`)}</li>
          </ol>
        </div>
      </div>
    </Dialog>
  )
}
