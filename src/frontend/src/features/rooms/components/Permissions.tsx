import { useWatchPermissions } from '@/features/rooms/hooks/useWatchPermissions'
import { css } from '@/styled-system/css'
import { Dialog, H } from '@/primitives'
import { RiEqualizer2Line } from '@remixicon/react'
import { useEffect, useMemo } from 'react'
import { useSnapshot } from 'valtio'
import { permissionsStore } from '@/stores/permissions'
import { useTranslation } from 'react-i18next'
import { injectIconIntoTranslation } from '@/utils/translation'

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
    injectIconIntoTranslation(t('body.openMenu'))

  useEffect(() => {
    if (
      permissions.isPermissionDialogOpen &&
      permissions.isCameraGranted &&
      permissions.isMicrophoneGranted
    ) {
      permissionsStore.isPermissionDialogOpen = false
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
      onClose={() => (permissionsStore.isPermissionDialogOpen = false)}
    >
      <div
        className={css({
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        })}
      >
        <img
          src="/assets/camera_mic_permission.svg"
          alt=""
          className={css({
            minWidth: '290px',
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
              {descriptionBeforeIcon}
              <span
                style={{ display: 'inline-block', verticalAlign: 'middle' }}
              >
                <RiEqualizer2Line />
              </span>
              {descriptionAfterIcon}
            </li>
            <li>{t(`body.details.${permissionLabel}`)}</li>
          </ol>
        </div>
      </div>
    </Dialog>
  )
}
