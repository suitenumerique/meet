import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import {
  isEqualTrackRef,
  isTrackReference,
  isWeb,
  log,
} from '@livekit/components-core'
import { Participant, RoomEvent, Track } from 'livekit-client'
import React, { useCallback, useRef, useState, useEffect } from 'react'
import {
  ConnectionStateToast,
  FocusLayoutContainer,
  LayoutContextProvider,
  RoomAudioRenderer,
  usePinnedTracks,
  useTracks,
  useCreateLayoutContext,
  useRoomContext,
} from '@livekit/components-react'
import { useTranslation } from 'react-i18next'

import { ControlBar } from './ControlBar/ControlBar'
import { styled } from '@/styled-system/jsx'
import { css, cva } from '@/styled-system/css'
import { MainNotificationToast } from '@/features/notifications/MainNotificationToast'
import { FocusLayout } from '../components/FocusLayout'
import { ParticipantTile } from '../components/ParticipantTile'
import { SidePanel } from '../components/SidePanel'
import { useSidePanel } from '../hooks/useSidePanel'
import { RecordingProvider } from '@/features/recording'
import { ScreenShareErrorModal } from '../components/ScreenShareErrorModal'
import { useConnectionObserver } from '../hooks/useConnectionObserver'
import { useNoiseReduction } from '../hooks/useNoiseReduction'
import { useVideoResolutionSubscription } from '../hooks/useVideoResolutionSubscription'
import { SettingsDialogProvider } from '@/features/settings/components/SettingsDialogProvider'
import { useSubtitles } from '@/features/subtitle/hooks/useSubtitles'
import { Subtitles } from '@/features/subtitle/component/Subtitles'
import { CarouselLayout } from '../components/layout/CarouselLayout'
import { GridLayout } from '../components/layout/GridLayout'
import { IsIdleDisconnectModal } from '../components/IsIdleDisconnectModal'
import { getParticipantName } from '@/features/rooms/utils/getParticipantName'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { IncidentBanner } from '@/components/IncidentBanner'

const LayoutWrapper = styled(
  'div',
  cva({
    base: {
      position: 'relative',
      display: 'flex',
      width: '100%',
      transition: 'height .5s cubic-bezier(0.4,0,0.2,1) 5ms',
    },
    variants: {
      areSubtitlesOpen: {
        true: {
          height: 'calc(100% - 12rem)',
        },
        false: {
          height: '100%',
        },
      },
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
    useRef<TrackReferenceOrPlaceholder | null>(null)
  const lastPinnedParticipantIdentityRef = useRef<string | null>(null)
  const { t } = useTranslation('rooms', { keyPrefix: 'pinAnnouncements' })
  const { t: tRooms } = useTranslation('rooms')
  const room = useRoomContext()
  const announce = useScreenReaderAnnounce()

  const getAnnouncementName = useCallback(
    (participant?: Participant | null) => {
      if (!participant) return tRooms('participants.unknown')
      return participant.isLocal
        ? tRooms('participants.you')
        : getParticipantName(participant)
    },
    [tRooms]
  )

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

  // handle pin announcements

  useEffect(() => {
    const participant = focusTrack?.participant

    // 1. unpin
    if (!participant) {
      if (!lastPinnedParticipantIdentityRef.current) return

      const lastIdentity = lastPinnedParticipantIdentityRef.current
      const lastParticipant =
        room.localParticipant.identity === lastIdentity
          ? room.localParticipant
          : room.remoteParticipants.get(lastIdentity)
      const announcementName = getAnnouncementName(lastParticipant)

      announce(
        lastParticipant?.isLocal
          ? t('self.unpin')
          : t('unpin', {
              name: announcementName,
            })
      )

      lastPinnedParticipantIdentityRef.current = null
      return
    }

    // 2. same pin → do nothing
    if (lastPinnedParticipantIdentityRef.current === participant.identity) {
      return
    }

    // 3. new pin
    const participantName = participant.isLocal
      ? tRooms('participants.you')
      : getParticipantName(participant)

    lastPinnedParticipantIdentityRef.current = participant.identity

    announce(
      participant.isLocal ? t('self.pin') : t('pin', { name: participantName })
    )
  }, [
    announce,
    focusTrack,
    getAnnouncementName,
    room.localParticipant,
    room.remoteParticipants,
    t,
    tRooms,
  ])

  /* eslint-disable react-hooks/exhaustive-deps */
  // Code duplicated from LiveKit; this warning will be addressed in the refactoring.
  useEffect(() => {
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
  const { areSubtitlesOpen } = useSubtitles()

  const [isShareErrorVisible, setIsShareErrorVisible] = useState(false)

  return (
    <div
      className="lk-video-conference"
      {...props}
      style={{
        overflowX: 'hidden',
      }}
    >
      <div
        className={css({
          display: 'flex',
          width: '100%',
          position: 'absolute',
          zIndex: '1000',
        })}
      >
        <IncidentBanner />
      </div>
      {isWeb() && (
        <LayoutContextProvider
          value={layoutContext}
          // onPinChange={handleFocusStateChange}
        >
          <ScreenShareErrorModal
            isOpen={isShareErrorVisible}
            onClose={() => setIsShareErrorVisible(false)}
          />
          <IsIdleDisconnectModal />
          <div
            // todo - extract these magic values into constant
            style={{
              position: 'absolute',
              inset: isSidePanelOpen
                ? `var(--lk-grid-gap) calc(358px + 3rem) calc(80px + var(--lk-grid-gap)) 16px`
                : `var(--lk-grid-gap) var(--lk-grid-gap) calc(80px + var(--lk-grid-gap))`,
              transition: 'inset .5s cubic-bezier(0.4,0,0.2,1) 5ms',
              maxHeight: '100%',
            }}
          >
            <LayoutWrapper areSubtitlesOpen={areSubtitlesOpen}>
              <div
                style={{
                  display: 'flex',
                  position: 'relative',
                  width: '100%',
                }}
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
            <Subtitles />
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
      <RecordingProvider />
      <SettingsDialogProvider />
    </div>
  )
}
