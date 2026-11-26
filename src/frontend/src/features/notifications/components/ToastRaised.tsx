import { useToast } from 'react-aria'
import { useRef } from 'react'

import { type ToastProps } from './Toast'
import { useTranslation } from 'react-i18next'
import { RiHand } from '@remixicon/react'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { ToastCard, ToastAction } from './ToastCard'

export function ToastRaised({ state, ...props }: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications')
  const ref = useRef(null)
  const { toastProps, contentProps, titleProps, closeButtonProps } = useToast(
    props,
    state,
    ref
  )
  const participant = props.toast.content.participant
  const { isParticipantsOpen, toggleParticipants } = useSidePanel()

  if (!participant) return

  return (
    <ToastCard
      {...toastProps}
      ref={ref}
      contentProps={contentProps}
      titleProps={titleProps}
      icon={
        <RiHand
          style={{
            animationDuration: '300ms',
            animationName: 'wave_hand',
            animationIterationCount: '2',
          }}
        />
      }
      actions={
        !isParticipantsOpen && (
          <ToastAction
            onPress={(e) => {
              toggleParticipants()
              closeButtonProps.onPress?.(e)
            }}
          >
            {t('raised.cta')}
          </ToastAction>
        )
      }
      closeButtonProps={closeButtonProps}
    >
      {t('raised.description', {
        name: participant.name || t('defaultName'),
      })}
    </ToastCard>
  )
}
