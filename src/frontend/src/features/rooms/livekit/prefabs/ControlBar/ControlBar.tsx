import { Track } from 'livekit-client'
import * as React from 'react'

import { MobileControlBar } from './MobileControlBar'
import { DesktopControlBar } from './DesktopControlBar'
import { useIsMobile } from '@/utils/useIsMobile'

export interface ControlBarProps extends React.HTMLAttributes<HTMLDivElement> {
  onDeviceError?: (error: { source: Track.Source; error: Error }) => void
}

/**
 * The `ControlBar` prefab gives the user the basic user interface to control their
 * media devices (camera, microphone and screen share), open the `Chat` and leave the room.
 */
export function ControlBar({ onDeviceError }: ControlBarProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return <MobileControlBar onDeviceError={onDeviceError} />
  }
  return <DesktopControlBar onDeviceError={onDeviceError} />
}

export type ControlBarAuxProps = Pick<ControlBarProps, 'onDeviceError'>
