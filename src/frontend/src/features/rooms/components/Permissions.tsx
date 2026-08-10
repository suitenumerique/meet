import { useWatchPermissions } from '@/features/rooms/hooks/useWatchPermissions'
import { css } from '@/styled-system/css'
import { Button, Dialog, H, P } from '@/primitives'
import { RiEqualizer2Line } from '@remixicon/react'
import { useEffect, useMemo } from 'react'
import { useSnapshot } from 'valtio'
import {
  closePermissionsDialog,
  closeSystemPermissionsDialog,
  permissionsStore,
} from '@/stores/permissions'
import { useTranslation } from 'react-i18next'
import { injectIconIntoTranslation } from '@/utils/translation'
import { isSafari } from '@/utils/livekit'
import { type OS, getOS } from '@/utils/os'

type StepsOs = 'macos' | 'windows' | 'android' | 'other'

const STEPS_OS: Record<OS, StepsOs> = {
  macos: 'macos',
  windows: 'windows',
  android: 'android',
  linux: 'other',
  other: 'other',
}

const getSystemSettingsUrl = (os: OS, label: string): string | null => {
  if (os === 'macos') {
    if (label === 'camera')
      return 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera'
    if (label === 'microphone')
      return 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
    return 'x-apple.systempreferences:com.apple.preference.security?Privacy'
  }
  if (os === 'windows') {
    if (label === 'camera') return 'ms-settings:privacy-webcam'
    if (label === 'microphone') return 'ms-settings:privacy-microphone'
    return 'ms-settings:privacy'
  }
  return null
}

const SystemPermissions = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'systemPermissionDialog' })
  const permissions = useSnapshot(permissionsStore)
  const os = useMemo(() => getOS() || 'other', [])

  const label = useMemo(() => {
    if (permissions.microphoneSystemDenied && permissions.cameraSystemDenied) {
      return 'cameraAndMicrophone'
    }
    if (permissions.cameraSystemDenied) return 'camera'
    return 'microphone'
  }, [permissions])

  const isOpen = permissions.isSystemPermissionDialogOpen

  // Auto-close once access works again (the user fixed the OS settings).
  useEffect(() => {
    if (
      isOpen &&
      !permissions.microphoneSystemDenied &&
      !permissions.cameraSystemDenied
    ) {
      closeSystemPermissionsDialog()
    }
  }, [isOpen, permissions])

  const device = t(`device.${label}`)
  const settingsUrl = getSystemSettingsUrl(os, label)

  return (
    <Dialog
      isOpen={isOpen}
      role="dialog"
      type="flex"
      title=""
      aria-label={t(`heading.${label}`)}
      onClose={closeSystemPermissionsDialog}
    >
      <div
        className={css({
          maxWidth: '500px',
        })}
      >
        <H lvl={1}>{t(`heading.${label}`)}</H>
        <P>{t('intro', { device })}</P>
        <ol className={css({ listStyle: 'decimal', paddingLeft: '24px' })}>
          {Array.from({ length: 2 }, (_, index) => (
            <li key={index}>
              {t(`steps.${STEPS_OS[os] || 'other'}.${index + 1}`, { device })}
            </li>
          ))}
        </ol>
        {settingsUrl && (
          <div className={css({ marginTop: '2rem' })}>
            <Button
              variant="primary"
              size="sm"
              onPress={() => {
                window.open(settingsUrl, '_blank')
              }}
            >
              {t('openSettings')}
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  )
}

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
    <>
      <SystemPermissions />
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
                      style={{
                        display: 'inline-block',
                        verticalAlign: 'middle',
                      }}
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
    </>
  )
}
