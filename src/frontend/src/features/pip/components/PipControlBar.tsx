import { styled } from '@/styled-system/jsx'
import { useRef, useMemo } from 'react'
import { AudioDevicesControl } from '@/features/rooms/livekit/components/controls/Device/AudioDevicesControl'
import { VideoDeviceControl } from '@/features/rooms/livekit/components/controls/Device/VideoDeviceControl'
import { ScreenShareToggle } from '@/features/rooms/livekit/components/controls/ScreenShareToggle'
import { LeaveButton } from '@/features/rooms/livekit/components/controls/LeaveButton'
import { SubtitlesToggle } from '@/features/rooms/livekit/components/controls/SubtitlesToggle'
import { HandToggle } from '@/features/rooms/livekit/components/controls/HandToggle'
import { StartMediaButton } from '@/features/rooms/livekit/components/controls/StartMediaButton'
import { usePipElementSize } from '../hooks/usePipElementSize'
import { PipOptionsMenu } from './controls/PipOptionsMenu'
import { PipReactionsToggle } from './PipReactionsToggle'

export type CollapsibleControl =
  | 'hand'
  | 'subtitles'
  | 'screenShare'
  | 'reactions'

const COLLAPSE_ORDER: CollapsibleControl[] = [
  'hand',
  'subtitles',
  'screenShare',
  'reactions',
]

const BUTTON_SLOT = 50
const ESSENTIAL_WIDTH = 260

function getHiddenControls(
  containerWidth: number,
  showScreenShare: boolean
): Set<CollapsibleControl> {
  const hidden = new Set<CollapsibleControl>()
  if (containerWidth <= 0) return hidden

  const collapsible = showScreenShare
    ? COLLAPSE_ORDER
    : COLLAPSE_ORDER.filter((c) => c !== 'screenShare')

  const available = containerWidth - ESSENTIAL_WIDTH
  const maxVisible = Math.max(0, Math.floor(available / BUTTON_SLOT))

  for (let i = 0; i < collapsible.length - maxVisible; i++) {
    hidden.add(collapsible[i])
  }
  return hidden
}

export const PipControlBar = ({
  showScreenShare,
}: {
  showScreenShare: boolean
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { width } = usePipElementSize(containerRef)

  const hidden = useMemo(
    () => getHiddenControls(width, showScreenShare),
    [width, showScreenShare]
  )

  return (
    <PipControls ref={containerRef}>
      <PipControlsCenter>
        <AudioDevicesControl hideMenu />
        <VideoDeviceControl hideMenu />
        {!hidden.has('reactions') && <PipReactionsToggle />}
        {showScreenShare && !hidden.has('screenShare') && <ScreenShareToggle />}
        {!hidden.has('subtitles') && <SubtitlesToggle />}
        {!hidden.has('hand') && <HandToggle />}
        <PipOptionsMenu overflowControls={hidden} />
        <LeaveButton />
        <StartMediaButton />
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
    padding: '0.5rem 0.75rem',
    backgroundColor: 'primaryDark.50',
    width: '100%',
    position: 'relative',
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
