import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { useLocation } from 'wouter'
import { RiCheckboxCircleFill } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { announceToScreenReader } from '@/stores/screenReaderAnnouncer'
import { supportStore } from '@/stores/support'
import { subscribeToSupportWidget } from '../utils/supportWidget'
import { ToastDuration } from '@/features/notifications/NotificationDuration'
import { ToastCard } from '@/features/notifications/components/ToastCard'

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
      <ToastCard
        icon={<RiCheckboxCircleFill />}
        title={t('title')}
        closeButtonProps={{ 'aria-label': t('close'), onPress: hide }}
      >
        {t('body')}
      </ToastCard>
    </div>
  )
}
