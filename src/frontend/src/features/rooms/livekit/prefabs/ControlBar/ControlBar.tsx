import { Track } from 'livekit-client'
import * as React from 'react'

import { MobileControlBar } from './MobileControlBar'
import { DesktopControlBar } from './DesktopControlBar'
import { SettingsDialogProvider } from '../../components/controls/SettingsDialogContext'
import { useIsMobile } from '@/utils/useIsMobile'
import { usePersistentUserChoices } from '../../hooks/usePersistentUserChoices'

/** @public */
export type ControlBarControls = {
  microphone?: boolean
  camera?: boolean
  chat?: boolean
  screenShare?: boolean
  leave?: boolean
  settings?: boolean
}

/** @public */
export interface ControlBarProps extends React.HTMLAttributes<HTMLDivElement> {
  onDeviceError?: (error: { source: Track.Source; error: Error }) => void
  variation?: 'minimal' | 'verbose' | 'textOnly'
  controls?: ControlBarControls
  /**
   * If `true`, the user's device choices will be persisted.
   * This will enable the user to have the same device choices when they rejoin the room.
   * @defaultValue true
   * @alpha
   */
  saveUserChoices?: boolean
}

/**
 * The `ControlBar` prefab gives the user the basic user interface to control their
 * media devices (camera, microphone and screen share), open the `Chat` and leave the room.
 *
 * @remarks
 * This component is build with other LiveKit components like `TrackToggle`,
 * `DeviceSelectorButton`, `DisconnectButton` and `StartAudio`.
 *
 * @example
 * ```tsx
 * <LiveKitRoom>
 *   <ControlBar />
 * </LiveKitRoom>
 * ```
 * @public
 */
export function ControlBar({ onDeviceError }: ControlBarProps) {
  const {
    saveAudioInputEnabled,
    saveVideoInputEnabled,
    saveAudioInputDeviceId,
    saveVideoInputDeviceId,
  } = usePersistentUserChoices()

  const microphoneOnChange = React.useCallback(
    (enabled: boolean, isUserInitiated: boolean) =>
      isUserInitiated ? saveAudioInputEnabled(enabled) : null,
    [saveAudioInputEnabled]
  )

  const cameraOnChange = React.useCallback(
    (enabled: boolean, isUserInitiated: boolean) =>
      isUserInitiated ? saveVideoInputEnabled(enabled) : null,
    [saveVideoInputEnabled]
  )

  const barProps = {
    onDeviceError,
    microphoneOnChange,
    cameraOnChange,
    saveAudioInputDeviceId,
    saveVideoInputDeviceId,
  }

  const isMobile = useIsMobile()

  return (
    <SettingsDialogProvider>
      {isMobile ? (
        <MobileControlBar {...barProps} />
      ) : (
        <DesktopControlBar {...barProps} />
      )}
    </SettingsDialogProvider>
  )
}

export interface ControlBarAuxProps {
  onDeviceError: ControlBarProps['onDeviceError']
  microphoneOnChange: (
    enabled: boolean,
    isUserInitiated: boolean
  ) => void | null
  cameraOnChange: (enabled: boolean, isUserInitiated: boolean) => void | null
  saveAudioInputDeviceId: (deviceId: string) => void
  saveVideoInputDeviceId: (deviceId: string) => void
}
