/* eslint-disable react-refresh/only-export-components */
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
import { usePipElementSize } from '../hooks/usePipElementSize'
import { useMemo, useRef } from 'react'

export const CollapsibleControls = {
  HAND: 'hand',
  SCREEN_SHARE: 'screenShare',
  REACTIONS: 'reactions',
} as const

export type CollapsibleControl =
  (typeof CollapsibleControls)[keyof typeof CollapsibleControls]

const COLLAPSE_ORDER: CollapsibleControl[] = [
  CollapsibleControls.HAND,
  CollapsibleControls.SCREEN_SHARE,
  CollapsibleControls.REACTIONS,
]

const BUTTON_SLOT = 50
const ESSENTIAL_WIDTH = 260

const getHiddenControls = (
  containerWidth: number,
  showScreenShare: boolean
): Set<CollapsibleControl> => {
  const hidden = new Set<CollapsibleControl>()
  if (containerWidth <= 0) return hidden

  const collapsible = showScreenShare
    ? COLLAPSE_ORDER
    : COLLAPSE_ORDER.filter((c) => c !== CollapsibleControls.SCREEN_SHARE)

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
  const { t } = useTranslation('rooms', {
    keyPrefix: 'pictureInPicture',
  })

  const hidden = useMemo(
    () => getHiddenControls(width, showScreenShare),
    [width, showScreenShare]
  )

  return (
    <PipControls
      ref={containerRef}
      id="pip-control-bar"
      role="toolbar"
      aria-label={t('controlBar')}
    >
      <PipControlsCenter>
        <AudioDevicesControl hideMenu />
        <VideoDeviceControl hideMenu />
        {!hidden.has(CollapsibleControls.REACTIONS) && <ReactionsToggle />}
        {showScreenShare && !hidden.has(CollapsibleControls.SCREEN_SHARE) && (
          <ScreenShareToggle />
        )}
        {!hidden.has(CollapsibleControls.HAND) && <HandToggle />}
        <StartMediaButton />
        <PipOptionsMenu overflowControls={hidden} />
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
