import { Button, Dialog, H, P } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { useSnapshot } from 'valtio'
import { connectionObserverStore } from '@/stores/connectionObserver'
import { HStack } from '@/styled-system/jsx'
import { useEffect, useRef, useState } from 'react'
import { navigateTo } from '@/navigation/navigateTo'
import humanizeDuration from 'humanize-duration'
import i18n from 'i18next'

const IDLE_DISCONNECT_TIMEOUT_MS = 120000 // 2 minutes
const COUNTDOWN_ANNOUNCEMENT_SECONDS = [120, 90, 60, 30]
const FINAL_COUNTDOWN_SECONDS = 10

export const IsIdleDisconnectModal = () => {
  const connectionObserverSnap = useSnapshot(connectionObserverStore)
  const [timeRemaining, setTimeRemaining] = useState(IDLE_DISCONNECT_TIMEOUT_MS)
  const [srMessage, setSrMessage] = useState('')
  const lastAnnouncementRef = useRef<number | null>(null)

  const { t } = useTranslation('rooms', { keyPrefix: 'isIdleDisconnectModal' })

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
      setSrMessage('')
    }
  }, [connectionObserverSnap.isIdleDisconnectModalOpen])

  const remainingSeconds = Math.ceil(timeRemaining / 1000)
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
          round: true,
        }),
      })
      setSrMessage(message)

      const timer = setTimeout(() => {
        setSrMessage('')
      }, 3000)

      return () => clearTimeout(timer)
    }
  }, [connectionObserverSnap.isIdleDisconnectModalOpen, remainingSeconds, t])

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
            <div className="sr-only" aria-live="polite" aria-atomic="true">
              {srMessage}
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
            <P>{t('settings')}</P>
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
