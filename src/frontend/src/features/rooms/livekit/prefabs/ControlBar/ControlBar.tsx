import { Track } from 'livekit-client'
import * as React from 'react'

import { MobileControlBar } from './MobileControlBar'
import { DesktopControlBar } from './DesktopControlBar'
import { useIsMobile } from '@/utils/useIsMobile'
import { ReactionsToolbar } from '@/features/reactions/components/toolbar/ReactionsToolbar'
import { css } from '@/styled-system/css'

export interface ControlBarProps extends React.HTMLAttributes<HTMLDivElement> {
  onDeviceError?: (error: { source: Track.Source; error: Error }) => void
}

/**
 * The `ControlBar` prefab gives the user the basic user interface to control their
 * media devices (camera, microphone and screen share), open the `Chat` and leave the room.
 */
export function ControlBar({ onDeviceError }: ControlBarProps) {
  const isMobile = useIsMobile()

  return (
    <div
      className={css({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
      })}
    >
      <ReactionsToolbar />
      <div
        id="control-bar"
        className={css({
          zIndex: 100,
        })}
      >
        {isMobile ? (
          <MobileControlBar onDeviceError={onDeviceError} />
        ) : (
          <DesktopControlBar onDeviceError={onDeviceError} />
        )}
      </div>
    </div>
  )
}
export type ControlBarAuxProps = Pick<ControlBarProps, 'onDeviceError'>
