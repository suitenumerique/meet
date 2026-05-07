import { useToastQueue } from '@react-stately/toast'
import { RiCloseLine } from '@remixicon/react'
import { styled } from '@/styled-system/jsx'
import { Button } from '@/primitives'
import { useTranslation } from 'react-i18next'
import {
  toastQueue,
  type ToastData,
} from '@/features/notifications/components/ToastProvider'
import { StyledToastContainer } from '@/features/notifications/components/Toast'
import { PipToastBody } from './PipToastBody'

/**
 * Shows shared toasts in the PiP window.
 * We use a local aria-live region so screen readers can read them in PiP.
 */
const MAX_VISIBLE = 3

export const PipNotificationOverlay = () => {
  const state = useToastQueue<ToastData>(toastQueue)
  const { t } = useTranslation('rooms', {
    keyPrefix: 'options.items.pictureInPicture',
  })

  if (state.visibleToasts.length === 0) return null

  const toasts = state.visibleToasts.slice(0, MAX_VISIBLE)

  return (
    <Region
      role="region"
      aria-label={t('notificationsLabel')}
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <StyledToastContainer
          key={toast.key}
          aria-atomic="true"
          css={{ margin: 0, marginLeft: 0, display: 'flex', alignItems: 'center', paddingRight: '0.25rem' }}
        >
          <PipToastBody toast={toast} />
          <Button
            square
            size="sm"
            invisible
            aria-label={t('dismissNotification')}
            onPress={() => state.close(toast.key)}
          >
            <RiCloseLine size={16} color="white" aria-hidden="true" />
          </Button>
        </StyledToastContainer>
      ))}
    </Region>
  )
}

const Region = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    alignItems: 'center',
    width: '100%',
  },
})

