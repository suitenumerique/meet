import { useToast } from '@react-aria/toast'
import { useMemo, useRef } from 'react'

import { StyledToastContainer, ToastProps } from './Toast'
import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { NotificationType } from '../NotificationType'
import { Button } from '@/primitives'
import { css } from '@/styled-system/css'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'

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
          key: 'transcript.requested',
          isMenuOpen: isTranscriptOpen,
          openMenu: openTranscript,
        }
      case NotificationType.ScreenRecordingRequested:
        return {
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
    <StyledToastContainer {...toastProps} ref={ref}>
      <HStack
        justify="center"
        alignItems="center"
        {...contentProps}
        padding={14}
        gap={0}
      >
        {t(options.key, {
          name: participant?.name,
        })}
        {!options.isMenuOpen && (
          <div
            className={css({
              marginLeft: '0.5rem',
            })}
          >
            <Button
              size="sm"
              variant="text"
              className={css({
                color: 'primary.300',
              })}
              onPress={options.openMenu}
            >
              {t('openMenu')}
            </Button>
          </div>
        )}
      </HStack>
    </StyledToastContainer>
  )
}
