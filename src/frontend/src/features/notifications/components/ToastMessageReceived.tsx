import { useToast } from 'react-aria'
import { useEffect, useRef } from 'react'

import { type ToastProps } from './Toast'
import { RiMessage2Line } from '@remixicon/react'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { useTranslation } from 'react-i18next'
import { ToastCard } from './ToastCard'

const MAX_PREVIEW_LENGTH = 120

export function ToastMessageReceived({
  state,
  ...props
}: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications')
  const ref = useRef(null)
  const { toastProps } = useToast(props, state, ref)

  const toast = props.toast

  const participant = toast.content.participant
  const message = toast.content.message

  const preview =
    message && message.length > MAX_PREVIEW_LENGTH
      ? `${message.slice(0, MAX_PREVIEW_LENGTH).trimEnd()}…`
      : message

  const { isChatOpen, toggleChat } = useSidePanel()

  useEffect(() => {
    if (isChatOpen) {
      state.close(toast.key)
    }
  }, [isChatOpen, toast, state])

  if (isChatOpen || !participant) return null

  return (
    <ToastCard
      {...toastProps}
      ref={ref}
      icon={<RiMessage2Line />}
      iconAlign="start"
      title={participant.name}
      onPress={() => toggleChat()}
      pressLabel={t('openChat')}
    >
      {preview}
    </ToastCard>
  )
}
