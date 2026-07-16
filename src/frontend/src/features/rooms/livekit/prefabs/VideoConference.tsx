import { isWeb } from '@livekit/components-core'
import { Track } from 'livekit-client'
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
import { useRoomPageTitle } from '../hooks/useRoomPageTitle'
import { useNoiseReduction } from '../hooks/useNoiseReduction'
import { useSyncLiveKitMetadata } from '../hooks/useSyncLiveKitMetadata'
import { VideoResolutionSubscription } from '../components/VideoResolutionSubscription'
import { SettingsDialogProvider } from '@/features/settings/components/SettingsDialogProvider'
import { IsIdleDisconnectModal } from '../components/IsIdleDisconnectModal'
import { ReactionPortals } from '@/features/reactions/components/ReactionPortals'
import { RoomContentArea } from '@/features/layout/components/RoomContentArea'
import { usePictureInPicture } from '@/features/pip/hooks/usePictureInPicture'
import { PipRoomPlaceholder } from '@/features/pip/components/PipRoomPlaceholder'
import { StageLayout } from '@/features/layout/components/StageLayout'
import { PinAnnouncer } from '@/features/layout/components/PinAnnouncer'
import { ChatProvider } from '@/features/chat/components/ChatProvider'

/**
 * @public
 */
export interface VideoConferenceProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @alpha */
  SettingsComponent?: React.ComponentType
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
  useRoomPageTitle()
  useSyncLiveKitMetadata()
  useNoiseReduction()

  const { isOpen: isPictureInPictureOpen } = usePictureInPicture()

  const [isShareErrorVisible, setIsShareErrorVisible] = useState(false)

  return (
    <>
      <ConnectionObserver />
      <ChatProvider />
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
            <ControlBar
              onDeviceError={(e) => {
                console.error(e)
                if (
                  e.source == Track.Source.ScreenShare &&
                  e.error.toString() ==
                    'NotAllowedError: Permission denied by system'
                ) {
                  setIsShareErrorVisible(true)
                }
              }}
            />
            <SidePanel />
          </>
        )}
        <RoomAudioRenderer />
        <ConnectionStateToast />
        <RecordingProvider />
        <SettingsDialogProvider />
        <ReactionPortals />
      </div>
    </>
  )
}
