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

// Compact PiP toolbar; keep all PiP-specific controls in one place.
export const PipControlBar = ({
  showScreenShare,
}: {
  showScreenShare: boolean
}) => (
  <PipControls>
    <AudioDevicesControl hideMenu />
    <VideoDeviceControl hideMenu />
    <ReactionsToggle />
    {showScreenShare && <ScreenShareToggle />}
    <SubtitlesToggle />
    <HandToggle />
    <OptionsButton />
    <LeaveButton />
    <StartMediaButton />
  </PipControls>
)

const PipControls = styled('div', {
  base: {
    flex: '0 0 auto',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '0.4rem',
    padding: '0.5rem 0.75rem',
    backgroundColor: 'var(--lk-controlbar-bg)',
    borderTop: '1px solid',
    borderColor: 'var(--lk-control-border-color)',
  },
})

