import { useToast } from 'react-aria'
import { useMemo, useRef } from 'react'

import type { ToastProps } from './Toast'
import { ToastCard, type ToastVariant } from './ToastCard'
import { useTranslation } from 'react-i18next'
import { Icon } from '@/primitives'
import { RiErrorWarningLine, RiRecordCircleLine } from '@remixicon/react'
import { NotificationType } from '../NotificationType'

export function ToastAnyRecording({ state, ...props }: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications')
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)
  const participant = props.toast.content.participant
  const type = props.toast.content.type

  const key = useMemo(() => {
    switch (type) {
      case NotificationType.TranscriptionStarted:
        return 'transcript.started'
      case NotificationType.TranscriptionStopped:
        return 'transcript.stopped'
      case NotificationType.TranscriptionLimitReached:
        return 'transcript.limitReached'
      case NotificationType.TranscriptionInterrupted:
        return 'transcript.interrupted'
      case NotificationType.TranscriptionFailed:
        return 'transcript.failed'
      case NotificationType.TranscriptionAborted:
        return 'transcript.aborted'
      case NotificationType.ScreenRecordingStarted:
        return 'screenRecording.started'
      case NotificationType.ScreenRecordingStopped:
        return 'screenRecording.stopped'
      case NotificationType.ScreenRecordingLimitReached:
        return 'screenRecording.limitReached'
      case NotificationType.ScreenRecordingInterrupted:
        return 'screenRecording.interrupted'
      case NotificationType.ScreenRecordingFailed:
        return 'screenRecording.failed'
      case NotificationType.ScreenRecordingAborted:
        return 'screenRecording.aborted'
      default:
        return
    }
  }, [type])

  const variant: ToastVariant = useMemo(() => {
    switch (type) {
      case NotificationType.TranscriptionFailed:
      case NotificationType.ScreenRecordingFailed:
        return 'error'
      case NotificationType.TranscriptionLimitReached:
      case NotificationType.ScreenRecordingLimitReached:
      case NotificationType.TranscriptionInterrupted:
      case NotificationType.ScreenRecordingInterrupted:
      case NotificationType.TranscriptionAborted:
      case NotificationType.ScreenRecordingAborted:
        return 'warning'
      default:
        return 'neutral'
    }
  }, [type])

  if (!key) return

  return (
    <ToastCard
      {...toastProps}
      ref={ref}
      contentProps={contentProps}
      variant={variant}
      icon={
        variant === 'error' || variant === 'warning' ? (
          <RiErrorWarningLine />
        ) : key.startsWith('transcript') ? (
          <Icon name="speech_to_text" />
        ) : (
          <RiRecordCircleLine />
        )
      }
    >
      {t(key, {
        name: participant?.name,
      })}
    </ToastCard>
  )
}
