import { Button, Dialog, H, P } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { useSnapshot } from 'valtio'
import { connectionObserverStore } from '@/stores/connectionObserver'
import { HStack } from '@/styled-system/jsx'
import { useEffect, useState } from 'react'
import { navigateTo } from '@/navigation/navigateTo'
import humanizeDuration from 'humanize-duration'
import i18n from 'i18next'

const IDLE_DISCONNECT_TIMEOUT_MS = 120000 // 2 minutes

export const IsIdleDisconnectModal = () => {
  const connectionObserverSnap = useSnapshot(connectionObserverStore)
  const [timeRemaining, setTimeRemaining] = useState(IDLE_DISCONNECT_TIMEOUT_MS)

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

  const minutes = Math.floor(timeRemaining / 1000 / 60)
  const seconds = (timeRemaining / 1000) % 60
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`

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
