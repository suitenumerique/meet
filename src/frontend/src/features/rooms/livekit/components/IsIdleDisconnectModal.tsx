import {
  A,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogDismissButton,
  DialogTitle,
  ScreenReaderAnnouncer,
} from '@/primitives'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { useSnapshot } from 'valtio'
import { connectionObserverStore } from '@/stores/connectionObserver'
import { useEffect, useRef, useState } from 'react'
import { navigateTo } from '@/navigation/navigateTo'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { SettingsDialogExtendedKey } from '@/features/settings/type'
import { useHumanizeDuration } from '@/hooks/useHumanizeDuration'
import { openSettingsDialog } from '@/stores/settings'

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
        flexShrink: 0,
        padding: '0.125rem 0.5rem',
        borderRadius: '4px',
        backgroundColor: 'background.semantic.brand.tertiary',
        color: 'content.semantic.brand.primary',
        fontSize: 'sm',
        fontWeight: 'medium',
        lineHeight: '1.25rem',
        fontVariantNumeric: 'tabular-nums',
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
  return <p>{t('body', { duration: formatter(IDLE_DISCONNECT_TIMEOUT_MS) })}</p>
}

const Settings = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'isIdleDisconnectModal' })
  return (
    <p>
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
    </p>
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
            <div
              className={css({
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '0.75rem',
              })}
            >
              <DialogTitle>{t('title')}</DialogTitle>
              <VisualCountDown />
            </div>
            <DialogBody>
              <Description />
              <Settings />
            </DialogBody>
            <DialogActions>
              <DialogDismissButton
                onPress={() => {
                  connectionObserverStore.isIdleDisconnectModalOpen = false
                  navigateTo('feedback', { duplicateIdentity: false })
                }}
              >
                {t('leaveButton')}
              </DialogDismissButton>
              <Button onPress={close} size="sm" variant="primary">
                {t('stayButton')}
              </Button>
            </DialogActions>
          </div>
        )
      }}
    </Dialog>
  )
}
