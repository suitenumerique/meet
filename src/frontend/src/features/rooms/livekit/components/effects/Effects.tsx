import { useLocalParticipant } from '@livekit/components-react'
import { LocalVideoTrack } from 'livekit-client'
import { css } from '@/styled-system/css'
import { EffectsConfiguration } from './EffectsConfiguration'
import { usePersistentUserChoices } from '../../hooks/usePersistentUserChoices'
import { useCanPublishTrack } from '@/features/rooms/livekit/hooks/useCanPublishTrack'
import { TrackSource } from '@livekit/protocol'
import { useSidePanel } from '../../hooks/useSidePanel'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'
import { useSidePanelRef } from '../../hooks/useSidePanelRef'
import { useSidePanelTriggers } from '../../hooks/useSidePanelTriggers'

export const Effects = () => {
  const { cameraTrack } = useLocalParticipant()
  const localCameraTrack = cameraTrack?.track as LocalVideoTrack
  const { saveProcessorSerialized } = usePersistentUserChoices()
  const { isEffectsOpen } = useSidePanel()
  const panelRef = useSidePanelRef()
  const { getTrigger } = useSidePanelTriggers()

  const canPublishCamera = useCanPublishTrack(TrackSource.CAMERA)

  useRestoreFocus(isEffectsOpen, {
    resolveTrigger: (activeEl) => {
      if (activeEl?.tagName === 'DIV') {
        return getTrigger('options') ?? activeEl
      }
      // For direct button clicks, use the active element as is
      return activeEl
    },
    // Focus the first focusable element when the panel opens
    onOpened: () => {
      requestAnimationFrame(() => {
        const panel = panelRef.current
        if (panel) {
          // Find the first toggle button (blur light button)
          const firstButton = panel.querySelector<HTMLElement>(
            '[data-attr="toggle-blur-light"]'
          )
          if (firstButton) {
            firstButton.focus({ preventScroll: true })
          }
        }
      })
    },
    restoreFocusRaf: true,
    preventScroll: true,
  })

  return (
    <div
      className={css({
        padding: '0 1.5rem',
        overflowY: 'scroll',
      })}
    >
      <EffectsConfiguration
        isDisabled={!canPublishCamera}
        videoTrack={localCameraTrack}
        layout="vertical"
        onSubmit={(processor) =>
          saveProcessorSerialized(processor?.serialize())
        }
      />
    </div>
  )
}
