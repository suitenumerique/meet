import { A, Button, Dialog, H, P, ScreenReaderAnnouncer } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { useSnapshot } from 'valtio'
import { connectionObserverStore } from '@/stores/connectionObserver'
import { HStack } from '@/styled-system/jsx'
import { useEffect, useRef, useState } from 'react'
import { navigateTo } from '@/navigation/navigateTo'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { useSettingsDialog } from '@/features/settings/hook/useSettingsDialog'
import { SettingsDialogExtendedKey } from '@/features/settings/type'
import { useHumanizeDuration } from '@/hooks/useHumanizeDuration'

const IDLE_DISCONNECT_TIMEOUT_MS = 120000 // 2 minutes
const COUNTDOWN_ANNOUNCEMENT_SECONDS = new Set([90, 60, 30])
const FINAL_COUNTDOWN_SECONDS = 10

const useSrCountdownAnnouncement = (seconds: number) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'isIdleDisconnectModal' })
  const announce = useScreenReaderAnnounce()

  const lastAnnouncementRef = useRef<number | null>(null)

  const formatter = useHumanizeDuration()

  useEffect(() => {
    const shouldAnnounce =
      COUNTDOWN_ANNOUNCEMENT_SECONDS.has(seconds) ||
      seconds <= FINAL_COUNTDOWN_SECONDS

    if (!shouldAnnounce) return
    if (seconds === lastAnnouncementRef.current) return

    lastAnnouncementRef.current = seconds
    const message = t('countdownAnnouncement', {
      duration: formatter(seconds * 1000, { round: false, largest: 2 }),
    })
    announce(message, 'assertive', 'idle')
  }, [announce, seconds, formatter, t])
}

const VisualCountDown = () => {
  const [timeRemaining, setTimeRemaining] = useState(IDLE_DISCONNECT_TIMEOUT_MS)

  const remainingSeconds = Math.floor(timeRemaining / 1000)
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`

  useSrCountdownAnnouncement(remainingSeconds)

  useEffect(() => {
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
  }, [])

  return (
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
  )
}

const Description = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'isIdleDisconnectModal' })
  const formatter = useHumanizeDuration()
  return <P>{t('body', { duration: formatter(IDLE_DISCONNECT_TIMEOUT_MS) })}</P>
}

const Settings = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'isIdleDisconnectModal' })
  const { openSettingsDialog } = useSettingsDialog()
  return (
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
  )
}

export const IsIdleDisconnectModal = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'isIdleDisconnectModal' })
  const connectionObserverSnap = useSnapshot(connectionObserverStore)
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
            <VisualCountDown />
            <H lvl={2} centered>
              {t('title')}
            </H>
            <Description />
            <Settings />
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
