import type { QueuedToast } from '@react-stately/toast'
import { useTranslation } from 'react-i18next'
import { RiHand, RiMessage2Line } from '@remixicon/react'
import type { ReactNode } from 'react'
import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { NotificationType } from '@/features/notifications/NotificationType'
import type { ToastData } from '@/features/notifications/components/ToastProvider'
import { RecordingMode } from '@/features/recording'

type Props = {
  toast: QueuedToast<ToastData>
}

/**
 * Renders the toast content used in PiP.
 * PiP stays display-only, so main-window actions are not shown here.
 */
export const PipToastBody = ({ toast }: Props) => {
  const { t } = useTranslation('notifications')
  const { type, participant, message, removedSources } = toast.content
  const name = participant?.name || t('defaultName')

  switch (type) {
    case NotificationType.ParticipantJoined:
      return <Line>{t('joined.description', { name })}</Line>

    case NotificationType.ParticipantMuted:
      return <Line>{t('muted', { name })}</Line>

    case NotificationType.HandRaised:
      return (
        <Line>
          <RiHand
            size={16}
            color="white"
            className={iconStyle}
            aria-hidden="true"
          />
          {t('raised.description', { name })}
        </Line>
      )

    case NotificationType.MessageReceived:
      return (
        <Line>
          <RiMessage2Line
            size={16}
            color="white"
            className={iconStyle}
            aria-hidden="true"
          />
          <span>
            <strong>{name}</strong>
            {message ? ` - ${message}` : null}
          </span>
        </Line>
      )

    case NotificationType.TranscriptionStarted:
      return <Line>{t('transcript.started', { name })}</Line>
    case NotificationType.TranscriptionStopped:
      return <Line>{t('transcript.stopped', { name })}</Line>
    case NotificationType.TranscriptionLimitReached:
      return <Line>{t('transcript.limitReached')}</Line>
    case NotificationType.TranscriptionRequested:
      return <Line>{t('transcript.requested', { name })}</Line>

    case NotificationType.ScreenRecordingStarted:
      return <Line>{t('screenRecording.started', { name })}</Line>
    case NotificationType.ScreenRecordingStopped:
      return <Line>{t('screenRecording.stopped', { name })}</Line>
    case NotificationType.ScreenRecordingLimitReached:
      return <Line>{t('screenRecording.limitReached')}</Line>
    case NotificationType.ScreenRecordingRequested:
      return <Line>{t('screenRecording.requested', { name })}</Line>

    case NotificationType.RecordingSaving: {
      const mode = toast.content.mode as RecordingMode | undefined
      const key =
        mode === RecordingMode.ScreenRecording
          ? 'recordingSave.screenRecording.default'
          : 'recordingSave.transcript.default'
      return <Line>{t(key)}</Line>
    }

    case NotificationType.PermissionsRemoved: {
      const key = resolvePermissionsKey(removedSources)
      if (!key) return null
      return <Line>{t(`permissionsRemoved.${key}`)}</Line>
    }

    default:
      return message ? <Line>{message}</Line> : null
  }
}

const resolvePermissionsKey = (sources: unknown): string | null => {
  if (!Array.isArray(sources) || sources.length === 0) return null
  if (sources.length === 1) return sources[0] as string
  if (sources.includes('screen_share')) return 'screen_share'
  return null
}

const Line = ({ children }: { children: ReactNode }) => (
  <HStack
    alignItems="center"
    gap="0.5rem"
    padding="0.625rem 0.75rem"
    className={css({
      fontSize: '0.8125rem',
      lineHeight: 1.3,
    })}
  >
    {children}
  </HStack>
)

const iconStyle = css({ flexShrink: 0 })
