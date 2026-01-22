import { styled } from '@/styled-system/jsx'
import { AudioDevicesControl } from './controls/Device/AudioDevicesControl'
import { VideoDeviceControl } from './controls/Device/VideoDeviceControl'
import { ScreenShareToggle } from './controls/ScreenShareToggle'
import { LeaveButton } from './controls/LeaveButton'
import { ReactionsToggle } from './controls/ReactionsToggle'
import { SubtitlesToggle } from './controls/SubtitlesToggle'
import { HandToggle } from './controls/HandToggle'
import { OptionsButton } from './controls/Options/OptionsButton'
import { StartMediaButton } from './controls/StartMediaButton'
import { PipLateralMenu } from './controls/PipLateralMenu'

/**
 * Compact control bar for the Picture-in-Picture window.
 * Centralizes all PiP controls (devices, reactions, screen share, options, etc.) in one reusable component.
 */
export const PipControlBar = ({
  showScreenShare,
}: {
  showScreenShare: boolean
}) => (
  <PipControls>
    <PipControlsCenter>
      <AudioDevicesControl hideMenu />
      <VideoDeviceControl hideMenu />
      <ReactionsToggle />
      {showScreenShare && <ScreenShareToggle />}
      <SubtitlesToggle />
      <HandToggle />
      <OptionsButton />
      <LeaveButton />
      <StartMediaButton />
    </PipControlsCenter>
    <PipControlsRight>
      <PipLateralMenu />
    </PipControlsRight>
  </PipControls>
)

const PipControls = styled('div', {
  base: {
    flex: '0 0 auto',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    backgroundColor: 'var(--lk-controlbar-bg)',
    borderTop: '1px solid',
    borderColor: 'var(--lk-control-border-color)',
    width: '100%',
    position: 'relative',
  },
})

const PipControlsCenter = styled('div', {
  base: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.4rem',
    flex: '1 1 auto',
  },
})

const PipControlsRight = styled('div', {
  base: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'absolute',
    right: '1.35rem',
  },
})

