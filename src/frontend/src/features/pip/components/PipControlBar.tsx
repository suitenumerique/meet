import { styled } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { AudioDevicesControl } from '@/features/rooms/livekit/components/controls/Device/AudioDevicesControl'
import { VideoDeviceControl } from '@/features/rooms/livekit/components/controls/Device/VideoDeviceControl'
import { ScreenShareToggle } from '@/features/rooms/livekit/components/controls/ScreenShareToggle'
import { LeaveButton } from '@/features/rooms/livekit/components/controls/LeaveButton'
import { HandToggle } from '@/features/rooms/livekit/components/controls/HandToggle'
import { StartMediaButton } from '@/features/rooms/livekit/components/controls/StartMediaButton'
import { ReactionsToggle } from '@/features/reactions/components/ReactionsToggle'
import { PipOptionsMenu } from './controls/PipOptionsMenu'

export const PipControlBar = ({
  showScreenShare,
}: {
  showScreenShare: boolean
}) => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'pictureInPicture',
  })

  return (
    <PipControls
      id="pip-control-bar"
      role="toolbar"
      aria-label={t('controlBar')}
    >
      <PipControlsCenter>
        <AudioDevicesControl hideMenu />
        <VideoDeviceControl hideMenu />
        <ReactionsToggle />
        {showScreenShare && <ScreenShareToggle />}
        <HandToggle />
        <StartMediaButton />
        <PipOptionsMenu />
        <LeaveButton />
      </PipControlsCenter>
    </PipControls>
  )
}

const PipControls = styled('div', {
  base: {
    flex: '0 0 auto',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1.125rem',
    width: '100%',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
})

const PipControlsCenter = styled('div', {
  base: {
    display: 'flex',
    flexWrap: 'nowrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.4rem',
    flex: '1 1 auto',
  },
})
