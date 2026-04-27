import { useToastQueue } from '@react-stately/toast'
import { RiCloseLine } from '@remixicon/react'
import { styled } from '@/styled-system/jsx'
import { Button } from '@/primitives'
import { useTranslation } from 'react-i18next'
import {
  toastQueue,
  type ToastData,
} from '@/features/notifications/components/ToastProvider'
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
        <ToastCard key={toast.key} aria-atomic="true">
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
        </ToastCard>
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

const ToastCard = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    maxWidth: '100%',
    backgroundColor: 'greyscale.700',
    color: 'white',
    borderRadius: '6px',
    boxShadow:
      'rgba(0, 0, 0, 0.4) 0px 2px 6px 0px, rgba(0, 0, 0, 0.25) 0px 4px 12px 2px',
    paddingRight: '0.25rem',
    animation: 'fade 200ms',
    '@media (prefers-reduced-motion: reduce)': {
      animation: 'none',
    },
  },
})
