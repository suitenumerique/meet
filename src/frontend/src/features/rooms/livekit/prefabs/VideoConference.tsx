import { isWeb } from '@livekit/components-core'
import { MediaDeviceFailure, Track } from 'livekit-client'
import { getMediaDeviceFailure } from '../utils/mediaPermissions'
import React, { useState } from 'react'
import {
  ConnectionStateToast,
  RoomAudioRenderer,
} from '@livekit/components-react'

import { ControlBar } from './ControlBar/ControlBar'
import { SidePanel } from '../components/SidePanel'
import { RecordingProvider } from '@/features/recording'
import { ScreenShareErrorModal } from '../components/ScreenShareErrorModal'
import { ConnectionObserver } from '../components/ConnectionObserver'
import { captureMediaEvent, reportError } from '@/features/analytics/telemetry'
import { getOS } from '@/utils/os'
import { isFireFox } from '@/utils/livekit'
import { MediaStateObserver } from '../components/MediaStateObserver'
import { RoomMetadataSynchronizer } from '../components/RoomMetadataSynchronizer'
import { useNoiseReduction } from '../hooks/useNoiseReduction'
import { VideoResolutionSubscription } from '../components/VideoResolutionSubscription'
import { SettingsDialogProvider } from '@/features/settings/components/SettingsDialogProvider'
import { MuteAlertDialogProvider } from '@/features/rooms/livekit/components/MuteAlertDialogProvider'
import { IsIdleDisconnectModal } from '../components/IsIdleDisconnectModal'
import { ReactionPortals } from '@/features/reactions/components/ReactionPortals'
import { RoomContentArea } from '@/features/layout/components/RoomContentArea'
import { usePictureInPicture } from '@/features/pip/hooks/usePictureInPicture'
import { PipRoomPlaceholder } from '@/features/pip/components/PipRoomPlaceholder'
import { StageLayout } from '@/features/layout/components/StageLayout'
import { PinAnnouncer } from '@/features/layout/components/PinAnnouncer'
import { ChatProvider } from '@/features/chat/components/ChatProvider'
import { SyncDevicePreferences } from '@/features/rooms/livekit/components/SyncDevicePreferences'
import { RoomSilentMicDetector } from '@/features/rooms/components/SilentMicDetector'
import { LobbyProvider } from '@/features/rooms/components/LobbyProvider'

/**
 * @public
 */
export interface VideoConferenceProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @alpha */
  SettingsComponent?: React.ComponentType
}

const getScreenSharePermissionDeniedScope = (
  error: Error
): 'system' | 'user' | 'browser' | null => {
  if (error.name === 'NotAllowedError') {
    if (/by system/i.test(error.message)) return 'system'
    if (/by user/i.test(error.message)) return 'user'
    return 'browser'
  }
  if (error.name === 'NotFoundError' && isFireFox() && getOS() === 'macos') {
    return 'system'
  }
  return null
}

/**
 * The `VideoConference` ready-made component is your drop-in solution for a classic video conferencing application.
 * It provides functionality such as focusing on one participant, grid view with pagination to handle large numbers
 * of participants, basic non-persistent chat, screen sharing, and more.
 *
 * @remarks
 * The component is implemented with other LiveKit components like `FocusContextProvider`,
 * `GridLayout`, `ControlBar`, `FocusLayoutContainer` and `FocusLayout`.
 * You can use this components as a starting point for your own custom video conferencing application.
 *
 * @example
 * ```tsx
 * <LiveKitRoom>
 *   <VideoConference />
 * <LiveKitRoom>
 * ```
 * @public
 */
export function VideoConference({ ...props }: VideoConferenceProps) {
  useNoiseReduction()

  const { isOpen: isPictureInPictureOpen } = usePictureInPicture()

  const [isShareErrorVisible, setIsShareErrorVisible] = useState(false)

  const handleDeviceError = ({
    source,
    error,
  }: {
    source: Track.Source
    error: Error
  }) => {
    if (source === Track.Source.ScreenShare) {
      const scope = getScreenSharePermissionDeniedScope(error)
      if (scope) {
        if (scope === 'system') setIsShareErrorVisible(true)
        void captureMediaEvent('screen-share-permission-denied', {
          at: 'ControlBar.onDeviceError',
          source,
          error_name: error.name,
          error_message: error.message,
          denied_scope: scope,
          os: getOS(),
        })
        return
      }
    }

    if (getMediaDeviceFailure(error) !== MediaDeviceFailure.Other) {
      return
    }

    reportError('device_switch_failure', error, {
      at: 'ControlBar.onDeviceError',
      source,
    })
  }

  return (
    <>
      <RoomMetadataSynchronizer />
      <ConnectionObserver />
      <SyncDevicePreferences />
      <RoomSilentMicDetector />
      <MediaStateObserver />
      <ChatProvider />
      <LobbyProvider />
      <VideoResolutionSubscription />
      <div
        className="lk-video-conference"
        {...props}
        style={{
          overflowX: 'hidden',
        }}
      >
        {isWeb() && (
          <>
            <ScreenShareErrorModal
              isOpen={isShareErrorVisible}
              onClose={() => setIsShareErrorVisible(false)}
            />
            <IsIdleDisconnectModal />
            <PinAnnouncer />
            <RoomContentArea>
              {isPictureInPictureOpen ? (
                <PipRoomPlaceholder />
              ) : (
                <StageLayout />
              )}
            </RoomContentArea>
            <ControlBar onDeviceError={handleDeviceError} />
            <SidePanel />
          </>
        )}
        <RoomAudioRenderer />
        <ConnectionStateToast />
        <RecordingProvider />
        <SettingsDialogProvider />
        <MuteAlertDialogProvider />
        <ReactionPortals />
      </div>
    </>
  )
}
