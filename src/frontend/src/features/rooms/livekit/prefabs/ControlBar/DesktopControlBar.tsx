import { supportsScreenSharing } from '@livekit/components-core'
import { ControlBarAuxProps } from './ControlBar'
import { css } from '@/styled-system/css'
import { LeaveButton } from '../../components/controls/LeaveButton'
import { Track } from 'livekit-client'
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
import { ReactionsToggle } from '@/features/reactions/components/ReactionsToggle'
import { ControlBarRegion } from '@/features/layout/components/ControlBarRegion'

export function DesktopControlBar({
  onDeviceError,
}: Readonly<ControlBarAuxProps>) {
  const browserSupportsScreenSharing = supportsScreenSharing()
  const desktopControlBarEl = useRef<HTMLDivElement>(null)

  const { toggleFullScreen, isFullscreenAvailable } = useFullScreen({})

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
      ref={desktopControlBarEl}
      className={css({
        width: '100vw',
        display: 'flex',
        padding: '1.125rem',
      })}
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
      <ControlBarRegion>
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
      </ControlBarRegion>
      <MoreOptions parentElement={desktopControlBarEl} />
    </div>
  )
}
