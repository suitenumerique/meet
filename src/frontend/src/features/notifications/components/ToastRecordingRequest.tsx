import { useToast } from 'react-aria'
import { useMemo, useRef } from 'react'

import { type ToastProps } from './Toast'
import { useTranslation } from 'react-i18next'
import { Icon } from '@/primitives'
import { NotificationType } from '../NotificationType'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { ToastCard, ToastAction } from './ToastCard'

export function ToastRecordingRequest({
  state,
  ...props
}: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications')
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)
  const participant = props.toast.content.participant
  const type = props.toast.content.type

  const {
    isTranscriptOpen,
    openTranscript,
    isScreenRecordingOpen,
    openScreenRecording,
  } = useSidePanel()

  const options = useMemo(() => {
    switch (type) {
      case NotificationType.TranscriptionRequested:
        return {
          icon: <Icon name="speech_to_text" />,
          key: 'transcript.requested',
          isMenuOpen: isTranscriptOpen,
          openMenu: openTranscript,
        }
      case NotificationType.ScreenRecordingRequested:
        return {
          icon: <Icon name="record" />,
          key: 'screenRecording.requested',
          isMenuOpen: isScreenRecordingOpen,
          openMenu: openScreenRecording,
        }
      default:
        return
    }
  }, [
    type,
    isTranscriptOpen,
    isScreenRecordingOpen,
    openTranscript,
    openScreenRecording,
  ])

  if (!options) return

  return (
    <ToastCard
      {...toastProps}
      ref={ref}
      contentProps={contentProps}
      icon={options.icon}
      actions={
        !options.isMenuOpen && (
          <ToastAction onPress={options.openMenu}>{t('openMenu')}</ToastAction>
        )
      }
    >
      {t(options.key, {
        name: participant?.name,
      })}
    </ToastCard>
  )
}
