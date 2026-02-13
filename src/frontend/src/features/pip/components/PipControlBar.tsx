import { styled } from '@/styled-system/jsx'
import { AudioDevicesControl } from '@/features/rooms/livekit/components/controls/Device/AudioDevicesControl'
import { VideoDeviceControl } from '@/features/rooms/livekit/components/controls/Device/VideoDeviceControl'
import { ScreenShareToggle } from '@/features/rooms/livekit/components/controls/ScreenShareToggle'
import { LeaveButton } from '@/features/rooms/livekit/components/controls/LeaveButton'
import { ReactionsToggle } from '@/features/rooms/livekit/components/controls/ReactionsToggle'
import { SubtitlesToggle } from '@/features/rooms/livekit/components/controls/SubtitlesToggle'
import { HandToggle } from '@/features/rooms/livekit/components/controls/HandToggle'
import { OptionsButton } from '@/features/rooms/livekit/components/controls/Options/OptionsButton'
import { StartMediaButton } from '@/features/rooms/livekit/components/controls/StartMediaButton'

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
    backgroundColor: 'primaryDark.50',
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
