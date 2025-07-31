import { Dialog, H } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { RiEqualizer2Line } from '@remixicon/react'
import { useEffect, useMemo } from 'react'
import { usePermissions } from '../hooks/usePermissions'
import { useModal } from '../hooks/useModal'

export const PermissionErrorModal = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'permissionErrorDialog' })
  const permissions = usePermissions()
  const { isOpen, close } = useModal('permissions')

  useEffect(() => {
    if (
      isOpen() &&
      permissions.isCameraGranted &&
      permissions.isMicrophoneGranted
    ) {
      close()
    }
  }, [permissions, isOpen, close])

  // Use to split the translation in half to inject an inline icon
  const icon_placeholder = 'ICON_PLACEHOLDER'
  const [openMenuFirstPart, openMenuSecondPart] = t('body.openMenu', {
    icon_placeholder,
  }).split(icon_placeholder)

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

  return (
    <Dialog
      isOpen={isOpen()}
      role="dialog"
      type="flex"
      title={''}
      aria-label={t(`heading.${permissionLabel}`, {
        app_title: `${import.meta.env.VITE_APP_TITLE}`,
      })}
      onClose={() => close()}
    >
      <HStack>
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
              app_title: `${import.meta.env.VITE_APP_TITLE}`,
            })}
          </H>
          <ol className={css({ listStyle: 'decimal', paddingLeft: '24px' })}>
            <li>
              {openMenuFirstPart}
              <span
                style={{ display: 'inline-block', verticalAlign: 'middle' }}
              >
                <RiEqualizer2Line />
              </span>
              {openMenuSecondPart}
            </li>
            <li>{t(`body.details.${permissionLabel}`)}</li>
          </ol>
        </div>
      </HStack>
    </Dialog>
  )
}
