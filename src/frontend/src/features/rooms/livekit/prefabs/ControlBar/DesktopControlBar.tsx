import { supportsScreenSharing } from '@livekit/components-core'
import { ControlBarAuxProps } from './ControlBar'
import { css } from '@/styled-system/css'
import { LeaveButton } from '../../components/controls/LeaveButton'
import { Track } from 'livekit-client'
import {
  ReactionsToggle,
  ReactionToolbar,
} from '../../components/controls/ReactionsToggle'
import { HandToggle } from '../../components/controls/HandToggle'
import { ScreenShareToggle } from '../../components/controls/ScreenShareToggle'
import { SubtitlesToggle } from '../../components/controls/SubtitlesToggle'
import { OptionsButton } from '../../components/controls/Options/OptionsButton'
import { StartMediaButton } from '../../components/controls/StartMediaButton'
import { MoreOptions } from './MoreOptions'
import { useRef } from 'react'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { useFullScreen } from '../../hooks/useFullScreen'
import { VideoDeviceControl } from '../../components/controls/Device/VideoDeviceControl'
import { AudioDevicesControl } from '../../components/controls/Device/AudioDevicesControl'
import { useSnapshot } from 'valtio'
import { layoutStore } from '@/stores/layout.ts'

export function DesktopControlBar({
  onDeviceError,
}: Readonly<ControlBarAuxProps>) {
  const browserSupportsScreenSharing = supportsScreenSharing()
  const desktopControlBarEl = useRef<HTMLDivElement>(null)

  const { toggleFullScreen, isFullscreenAvailable } = useFullScreen({})

  const layoutSnap = useSnapshot(layoutStore)

  useRegisterKeyboardShortcut({
    id: 'focus-toolbar',
    handler: () => {
      const root = desktopControlBarEl.current
      if (!root) return
      const firstButton = root.querySelector<HTMLButtonElement>(
        'button, [role="button"], [tabindex="0"]'
      )
      firstButton?.focus()
    },
  })

  useRegisterKeyboardShortcut({
    id: 'fullscreen',
    handler: toggleFullScreen,
    isDisabled: !isFullscreenAvailable,
  })

  return (
    <div
      className={css({
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
      })}
    >
      {layoutSnap.showReaction && <ReactionToolbar />}
      <div
        ref={desktopControlBarEl}
        className={css({
          width: '100vw',
          display: 'flex',
          padding: '1.125rem',
        })}
        style={{
          paddingTop: layoutSnap.showReaction ? '0.65rem' : undefined,
        }}
      >
        <div
          className={css({
            display: 'flex',
            justifyContent: 'flex-start',
            flex: '1 1 33%',
            alignItems: 'center',
            gap: '0.5rem',
            marginLeft: '0.5rem',
          })}
        />
        <div
          id="desktop-control-bar"
          className={css({
            flex: '1 1 33%',
            alignItems: 'center',
            justifyContent: 'center',
            display: 'flex',
            gap: '0.65rem',
          })}
        >
          <AudioDevicesControl
            onDeviceError={(error) =>
              onDeviceError?.({ source: Track.Source.Microphone, error })
            }
          />
          <VideoDeviceControl
            onDeviceError={(error) =>
              onDeviceError?.({ source: Track.Source.Camera, error })
            }
          />
          <ReactionsToggle />
          {browserSupportsScreenSharing && (
            <ScreenShareToggle
              onDeviceError={(error) =>
                onDeviceError?.({ source: Track.Source.ScreenShare, error })
              }
            />
          )}
          <SubtitlesToggle />
          <HandToggle />
          <OptionsButton />
          <LeaveButton />
          <StartMediaButton />
        </div>
        <MoreOptions parentElement={desktopControlBarEl} />
      </div>
    </div>
  )
}
