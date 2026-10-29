import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { useLocation } from 'wouter'
import { RiCheckboxCircleFill, RiCloseLine } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { Button, Text } from '@/primitives'
import { announceToScreenReader } from '@/stores/screenReaderAnnouncer'
import { supportStore } from '@/stores/support'
import { subscribeToSupportWidget } from '../utils/supportWidget'
import { ToastDuration } from '@/features/notifications/NotificationDuration'
import { StyledToast } from '@/features/notifications/components/StyledToast'
import { StyledToastContainer } from '@/features/notifications/components/StyledToastContainer'

const hide = () => {
  supportStore.showSentConfirmation = false
}

export const SupportWidget = () => {
  const { t } = useTranslation('global', { keyPrefix: 'support.sent' })
  const { showSentConfirmation } = useSnapshot(supportStore)
  const [location] = useLocation()

  useEffect(() => subscribeToSupportWidget(), [])

  useEffect(hide, [location])

  useEffect(() => {
    if (!showSentConfirmation) return
    announceToScreenReader(`${t('title')}. ${t('body')}`)
    const timeout = window.setTimeout(hide, ToastDuration.EXTRA_LONG)
    return () => window.clearTimeout(timeout)
  }, [showSentConfirmation, t])

  if (!showSentConfirmation) return null

  return (
    <div
      className={css({
        position: 'fixed',
        top: '5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
      })}
    >
      <StyledToastContainer>
        <StyledToast>
          <RiCheckboxCircleFill
            size={24}
            aria-hidden="true"
            className={css({ color: 'success.300', flexShrink: 0 })}
          />
          <div>
            <Text margin={false} bold>
              {t('title')}
            </Text>
            <Text margin={false}>{t('body')}</Text>
          </div>
          <Button
            square
            size="sm"
            invisible
            aria-label={t('close')}
            onPress={hide}
          >
            <RiCloseLine color="white" />
          </Button>
        </StyledToast>
      </StyledToastContainer>
    </div>
  )
}
