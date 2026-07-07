import { useToast } from 'react-aria'
import { useMemo, useRef } from 'react'

import { type ToastProps } from './Toast'
import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { NotificationType } from '../NotificationType'
import { Button } from '@/primitives'
import { css } from '@/styled-system/css'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { StyledToastContainer } from './StyledToastContainer'
import { TRANSCRIPT_PLUGIN_ID } from '@/features/recording/transcript.plugin'
import { SCREEN_RECORDING_PLUGIN_ID } from '@/features/recording/screenRecording.plugin'
import { useIsToolVisible } from '@/features/plugins'

export function ToastRecordingRequest({
  state,
  ...props
}: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications')
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)
  const participant = props.toast.content.participant
  const type = props.toast.content.type

  const { isSubPanelOpen, openSubPanel } = useSidePanel()
  const isTranscriptToolVisible = useIsToolVisible(TRANSCRIPT_PLUGIN_ID)
  const isScreenToolVisible = useIsToolVisible(SCREEN_RECORDING_PLUGIN_ID)

  const options = useMemo(() => {
    switch (type) {
      case NotificationType.TranscriptionRequested:
        return {
          key: 'transcript.requested',
          isMenuOpen: isSubPanelOpen(TRANSCRIPT_PLUGIN_ID),
          canOpenMenu: isTranscriptToolVisible,
          openMenu: () => openSubPanel(TRANSCRIPT_PLUGIN_ID),
        }
      case NotificationType.ScreenRecordingRequested:
        return {
          key: 'screenRecording.requested',
          isMenuOpen: isSubPanelOpen(SCREEN_RECORDING_PLUGIN_ID),
          canOpenMenu: isScreenToolVisible,
          openMenu: () => openSubPanel(SCREEN_RECORDING_PLUGIN_ID),
        }
      default:
        return
    }
  }, [
    type,
    isSubPanelOpen,
    openSubPanel,
    isTranscriptToolVisible,
    isScreenToolVisible,
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
        {!options.isMenuOpen && options.canOpenMenu && (
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
