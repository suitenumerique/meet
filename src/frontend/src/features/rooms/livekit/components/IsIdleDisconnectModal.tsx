import { A, Button, Dialog, H, P, ScreenReaderAnnouncer } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { useSnapshot } from 'valtio'
import { connectionObserverStore } from '@/stores/connectionObserver'
import { HStack } from '@/styled-system/jsx'
import { useEffect, useRef, useState } from 'react'
import { navigateTo } from '@/navigation/navigateTo'
import humanizeDuration from 'humanize-duration'
import i18n from 'i18next'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { useSettingsDialog } from '@/features/settings/hook/useSettingsDialog'
import { SettingsDialogExtendedKey } from '@/features/settings/type'

const IDLE_DISCONNECT_TIMEOUT_MS = 120000 // 2 minutes
const COUNTDOWN_ANNOUNCEMENT_SECONDS = [90, 60, 30]
const FINAL_COUNTDOWN_SECONDS = 10

export const IsIdleDisconnectModal = () => {
  const connectionObserverSnap = useSnapshot(connectionObserverStore)
  const [timeRemaining, setTimeRemaining] = useState(IDLE_DISCONNECT_TIMEOUT_MS)
  const lastAnnouncementRef = useRef<number | null>(null)
  const { openSettingsDialog } = useSettingsDialog()

  const { t } = useTranslation('rooms', { keyPrefix: 'isIdleDisconnectModal' })
  const announce = useScreenReaderAnnounce()

  useEffect(() => {
    if (connectionObserverSnap.isIdleDisconnectModalOpen) {
      setTimeRemaining(IDLE_DISCONNECT_TIMEOUT_MS)
      const interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1000) {
            clearInterval(interval)
            connectionObserverStore.isIdleDisconnectModalOpen = false
            navigateTo('feedback', { duplicateIdentity: false })
            return 0
          }
          return prev - 1000
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [connectionObserverSnap.isIdleDisconnectModalOpen])

  useEffect(() => {
    if (!connectionObserverSnap.isIdleDisconnectModalOpen) {
      lastAnnouncementRef.current = null
    }
  }, [connectionObserverSnap.isIdleDisconnectModalOpen])

  const remainingSeconds = Math.floor(timeRemaining / 1000)
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`

  useEffect(() => {
    if (!connectionObserverSnap.isIdleDisconnectModalOpen) return

    const shouldAnnounce =
      COUNTDOWN_ANNOUNCEMENT_SECONDS.includes(remainingSeconds) ||
      remainingSeconds <= FINAL_COUNTDOWN_SECONDS

    if (shouldAnnounce && remainingSeconds !== lastAnnouncementRef.current) {
      lastAnnouncementRef.current = remainingSeconds
      const message = t('countdownAnnouncement', {
        duration: humanizeDuration(remainingSeconds * 1000, {
          language: i18n.language,
          round: false,
          largest: 2,
        }),
      })
      announce(message, 'assertive', 'idle')
    }
  }, [
    announce,
    connectionObserverSnap.isIdleDisconnectModalOpen,
    remainingSeconds,
    t,
  ])

  return (
    <Dialog
      isOpen={connectionObserverSnap.isIdleDisconnectModalOpen}
      role="alertdialog"
      type="alert"
      aria-label={t('title')}
      onClose={() => {
        connectionObserverStore.isIdleDisconnectModalOpen = false
      }}
    >
      {({ close }) => {
        return (
          <div>
            <ScreenReaderAnnouncer channel="idle" />
            <div
              className={css({
                height: '50px',
                width: '50px',
                backgroundColor: 'blue.100',
                borderRadius: '25px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                fontWeight: '500',
                color: 'blue.800',
                margin: 'auto',
              })}
              aria-hidden="true"
            >
              {formattedTime}
            </div>
            <H lvl={2} centered>
              {t('title')}
            </H>
            <P>
              {t('body', {
                duration: humanizeDuration(IDLE_DISCONNECT_TIMEOUT_MS, {
                  language: i18n.language,
                }),
              })}
            </P>
            <P>
              {t('settingsPrefix')}{' '}
              <A
                color="primary"
                onPress={() => {
                  connectionObserverStore.isIdleDisconnectModalOpen = false
                  openSettingsDialog(SettingsDialogExtendedKey.GENERAL)
                }}
              >
                {t('settingsLink')}
              </A>
              {t('settingsSuffix')}
            </P>
            <HStack marginTop="2rem">
              <Button
                onPress={() => {
                  connectionObserverStore.isIdleDisconnectModalOpen = false
                  navigateTo('feedback', { duplicateIdentity: false })
                }}
                size="sm"
                variant="secondary"
              >
                {t('leaveButton')}
              </Button>
              <Button onPress={close} size="sm" variant="primary">
                {t('stayButton')}
              </Button>
            </HStack>
          </div>
        )
      }}
    </Dialog>
  )
}
