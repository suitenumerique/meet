import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import {
  isEqualTrackRef,
  isTrackReference,
  isWeb,
  log,
} from '@livekit/components-core'
import { RoomEvent, Track } from 'livekit-client'
import * as React from 'react'
import { useState } from 'react'
import {
  CarouselLayout,
  ConnectionStateToast,
  FocusLayoutContainer,
  GridLayout,
  LayoutContextProvider,
  RoomAudioRenderer,
  usePinnedTracks,
  useTracks,
  useCreateLayoutContext,
} from '@livekit/components-react'

import { ControlBar } from './ControlBar/ControlBar'
import { styled } from '@/styled-system/jsx'
import { cva } from '@/styled-system/css'
import { MainNotificationToast } from '@/features/notifications/MainNotificationToast'
import { FocusLayout } from '../components/FocusLayout'
import { ParticipantTile } from '../components/ParticipantTile'
import { SidePanel } from '../components/SidePanel'
import { useSidePanel } from '../hooks/useSidePanel'
import { RecordingStateToast } from '@/features/recording'
import { ScreenShareErrorModal } from '../components/ScreenShareErrorModal'
import { useConnectionObserver } from '../hooks/useConnectionObserver'
import { useNoiseReduction } from '../hooks/useNoiseReduction'
import { useVideoResolutionSubscription } from '../hooks/useVideoResolutionSubscription'

const LayoutWrapper = styled(
  'div',
  cva({
    base: {
      position: 'relative',
      display: 'flex',
      width: '100%',
      height: '100%',
    },
  })
)

/**
 * @public
 */
export interface VideoConferenceProps
  extends React.HTMLAttributes<HTMLDivElement> {
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
  const lastAutoFocusedScreenShareTrack =
    React.useRef<TrackReferenceOrPlaceholder | null>(null)

  useConnectionObserver()
  useVideoResolutionSubscription()

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false }
  )

  const layoutContext = useCreateLayoutContext()

  useNoiseReduction()

  const screenShareTracks = tracks
    .filter(isTrackReference)
    .filter((track) => track.publication.source === Track.Source.ScreenShare)

  const focusTrack = usePinnedTracks(layoutContext)?.[0]
  const carouselTracks = tracks.filter(
    (track) => !isEqualTrackRef(track, focusTrack)
  )

  /* eslint-disable react-hooks/exhaustive-deps */
  // Code duplicated from LiveKit; this warning will be addressed in the refactoring.
  React.useEffect(() => {
    // If screen share tracks are published, and no pin is set explicitly, auto set the screen share.
    if (
      screenShareTracks.some((track) => track.publication.isSubscribed) &&
      lastAutoFocusedScreenShareTrack.current === null
    ) {
      log.debug('Auto set screen share focus:', {
        newScreenShareTrack: screenShareTracks[0],
      })
      layoutContext.pin.dispatch?.({
        msg: 'set_pin',
        trackReference: screenShareTracks[0],
      })
      lastAutoFocusedScreenShareTrack.current = screenShareTracks[0]
    } else if (
      lastAutoFocusedScreenShareTrack.current &&
      !screenShareTracks.some(
        (track) =>
          track.publication.trackSid ===
          lastAutoFocusedScreenShareTrack.current?.publication?.trackSid
      )
    ) {
      log.debug('Auto clearing screen share focus.')
      layoutContext.pin.dispatch?.({ msg: 'clear_pin' })
      lastAutoFocusedScreenShareTrack.current = null
    }
    if (focusTrack && !isTrackReference(focusTrack)) {
      const updatedFocusTrack = tracks.find(
        (tr) =>
          tr.participant.identity === focusTrack.participant.identity &&
          tr.source === focusTrack.source
      )
      if (
        updatedFocusTrack !== focusTrack &&
        isTrackReference(updatedFocusTrack)
      ) {
        layoutContext.pin.dispatch?.({
          msg: 'set_pin',
          trackReference: updatedFocusTrack,
        })
      }
    }
  }, [
    screenShareTracks
      .map(
        (ref) => `${ref.publication.trackSid}_${ref.publication.isSubscribed}`
      )
      .join(),
    focusTrack?.publication?.trackSid,
    tracks,
  ])
  /* eslint-enable react-hooks/exhaustive-deps */

  const { isSidePanelOpen } = useSidePanel()

  const [isShareErrorVisible, setIsShareErrorVisible] = useState(false)

  return (
    <div
      className="lk-video-conference"
      {...props}
      style={{
        overflowX: 'hidden',
      }}
    >
      {isWeb() && (
        <LayoutContextProvider
          value={layoutContext}
          // onPinChange={handleFocusStateChange}
        >
          <ScreenShareErrorModal
            isOpen={isShareErrorVisible}
            onClose={() => setIsShareErrorVisible(false)}
          />
          <div
            // todo - extract these magic values into constant
            style={{
              position: 'absolute',
              inset: isSidePanelOpen
                ? 'var(--lk-grid-gap) calc(358px + 3rem) calc(80px + var(--lk-grid-gap)) 16px'
                : 'var(--lk-grid-gap) var(--lk-grid-gap) calc(80px + var(--lk-grid-gap))',
              transition: 'inset .5s cubic-bezier(0.4,0,0.2,1) 5ms',
            }}
          >
            <LayoutWrapper>
              <div
                style={{ display: 'flex', position: 'relative', width: '100%' }}
              >
                {!focusTrack ? (
                  <div
                    className="lk-grid-layout-wrapper"
                    style={{ height: 'auto' }}
                  >
                    <GridLayout tracks={tracks} style={{ padding: 0 }}>
                      <ParticipantTile />
                    </GridLayout>
                  </div>
                ) : (
                  <div
                    className="lk-focus-layout-wrapper"
                    style={{ height: 'auto' }}
                  >
                    <FocusLayoutContainer style={{ padding: 0 }}>
                      <CarouselLayout
                        tracks={carouselTracks}
                        style={{
                          minWidth: '200px',
                        }}
                      >
                        <ParticipantTile />
                      </CarouselLayout>
                      {focusTrack && <FocusLayout trackRef={focusTrack} />}
                    </FocusLayoutContainer>
                  </div>
                )}
              </div>
            </LayoutWrapper>
            <MainNotificationToast />
          </div>
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
        </LayoutContextProvider>
      )}
      <RoomAudioRenderer />
      <ConnectionStateToast />
      <RecordingStateToast />
    </div>
  )
}
