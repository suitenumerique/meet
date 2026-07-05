import type {
  PinState,
  TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import {
  isTrackReference,
  isTrackReferencePinned,
  isWeb,
  log,
} from '@livekit/components-core'
import { RoomEvent, Track } from 'livekit-client'
import React, { useCallback, useRef, useState, useEffect } from 'react'
import {
  ConnectionStateToast,
  FocusLayoutContainer,
  LayoutContextProvider,
  RoomAudioRenderer,
  useTracks,
} from '@livekit/components-react'
import { useTranslation } from 'react-i18next'

import { ControlBar } from './ControlBar/ControlBar'
import { ParticipantTile } from '../components/ParticipantTile'
import { SidePanel } from '../components/SidePanel'
import { RecordingProvider } from '@/features/recording'
import { ScreenShareErrorModal } from '../components/ScreenShareErrorModal'
import { useConnectionObserver } from '../hooks/useConnectionObserver'
import { useRoomPageTitle } from '../hooks/useRoomPageTitle'
import { useNoiseReduction } from '../hooks/useNoiseReduction'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { useSettingsDialog } from '@/features/settings'
import { SettingsDialogExtendedKey } from '@/features/settings/type'
import { useVideoResolutionSubscription } from '../hooks/useVideoResolutionSubscription'
import { useSyncLiveKitMetadata } from '../hooks/useSyncLiveKitMetadata'
import { SettingsDialogProvider } from '@/features/settings/components/SettingsDialogProvider'
import { IsIdleDisconnectModal } from '../components/IsIdleDisconnectModal'
import { getParticipantName } from '@/features/rooms/utils/getParticipantName'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { ReactionPortals } from '@/features/reactions/components/ReactionPortals'
import { CarouselLayout } from '@/features/layout/components/CarouselLayout'
import { GridLayout } from '@/features/layout/components/GridLayout'
import { RoomContentArea } from '@/features/layout/components/RoomContentArea'
import { usePictureInPicture } from '@/features/pip/hooks/usePictureInPicture'
import { PipRoomPlaceholder } from '@/features/pip/components/PipRoomPlaceholder'
import { useCreateMultiPinLayoutContext } from '../hooks/useMultiPin'

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
 * Focus (pin) state is local to each participant and supports pinning several
 * tiles at once (see {@link useCreateMultiPinLayoutContext}). Pinned tiles are
 * laid out in a responsive grid while the remaining tiles move to the carousel.
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
  const previousPinnedTracksRef = useRef<PinState>([])
  const { t } = useTranslation('rooms', { keyPrefix: 'pinAnnouncements' })
  const announce = useScreenReaderAnnounce()
  const { toggleSettingsDialog } = useSettingsDialog()

  useConnectionObserver()
  useRoomPageTitle()
  useVideoResolutionSubscription()
  useSyncLiveKitMetadata()

  useRegisterKeyboardShortcut({
    id: 'open-shortcuts',
    handler: useCallback(() => {
      toggleSettingsDialog(SettingsDialogExtendedKey.SHORTCUTS)
    }, [toggleSettingsDialog]),
  })

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false }
  )

  const { layoutContext, pinnedTracks, dispatchPin } =
    useCreateMultiPinLayoutContext()

  useNoiseReduction()

  const screenShareTracks = tracks
    .filter(isTrackReference)
    .filter((track) => track.publication.source === Track.Source.ScreenShare)

  const carouselTracks = tracks.filter(
    (track) => !isTrackReferencePinned(track, pinnedTracks)
  )

  const { isOpen: isPictureInPictureOpen } = usePictureInPicture()

  // Announce pin/unpin changes to screen-reader users. Each pinned tile is keyed
  // by participant + source so a change to one tile is announced independently
  // of the others.
  useEffect(() => {
    const keyOf = (track: TrackReferenceOrPlaceholder) =>
      `${track.participant.identity}:${track.source}`
    const previous = previousPinnedTracksRef.current
    const previousKeys = new Set(previous.map(keyOf))
    const currentKeys = new Set(pinnedTracks.map(keyOf))

    const announcePin = (
      track: TrackReferenceOrPlaceholder,
      pinned: boolean
    ) => {
      if (track.participant.isLocal) {
        announce(pinned ? t('self.pin') : t('self.unpin'))
        return
      }
      const name = getParticipantName(track.participant)
      announce(pinned ? t('pin', { name }) : t('unpin', { name }))
    }

    pinnedTracks.forEach((track) => {
      if (!previousKeys.has(keyOf(track))) announcePin(track, true)
    })
    previous.forEach((track) => {
      if (!currentKeys.has(keyOf(track))) announcePin(track, false)
    })

    previousPinnedTracksRef.current = pinnedTracks
  }, [pinnedTracks, announce, t])

  /* eslint-disable react-hooks/exhaustive-deps */
  // Adapted from LiveKit's VideoConference auto-focus effect; the dependency
  // array is intentionally hand-tuned. This warning will be addressed in the
  // upcoming refactoring.
  useEffect(() => {
    // Auto-focus the first screen share once, as LiveKit does — but *add* it to
    // the pinned tiles instead of replacing them, so manual pins are preserved.
    if (
      screenShareTracks.some((track) => track.publication.isSubscribed) &&
      lastAutoFocusedScreenShareTrack.current === null
    ) {
      log.debug('Auto set screen share focus:', {
        newScreenShareTrack: screenShareTracks[0],
      })
      dispatchPin({ msg: 'add_pin', trackReference: screenShareTracks[0] })
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
      dispatchPin({
        msg: 'remove_pin',
        trackReference: lastAutoFocusedScreenShareTrack.current,
      })
      lastAutoFocusedScreenShareTrack.current = null
    }

    // Replace any pinned placeholder with its now-published track reference, so
    // a pinned camera that was off starts rendering once it is turned on.
    pinnedTracks.forEach((pinned) => {
      if (isTrackReference(pinned)) return
      const updatedTrack = tracks.find(
        (track) =>
          track.participant.identity === pinned.participant.identity &&
          track.source === pinned.source
      )
      if (updatedTrack && isTrackReference(updatedTrack)) {
        dispatchPin({ msg: 'replace_pin', trackReference: updatedTrack })
      }
    })
  }, [
    screenShareTracks
      .map(
        (ref) => `${ref.publication.trackSid}_${ref.publication.isSubscribed}`
      )
      .join(),
    pinnedTracks,
    tracks,
  ])
  /* eslint-enable react-hooks/exhaustive-deps */

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
        <LayoutContextProvider value={layoutContext}>
          <ScreenShareErrorModal
            isOpen={isShareErrorVisible}
            onClose={() => setIsShareErrorVisible(false)}
          />
          <IsIdleDisconnectModal />
          <RoomContentArea>
            {isPictureInPictureOpen ? (
              <PipRoomPlaceholder />
            ) : pinnedTracks.length === 0 ? (
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
                  <GridLayout tracks={pinnedTracks} style={{ padding: 0 }}>
                    <ParticipantTile />
                  </GridLayout>
                </FocusLayoutContainer>
              </div>
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
        </LayoutContextProvider>
      )}
      <RoomAudioRenderer />
      <ConnectionStateToast />
      <RecordingProvider />
      <SettingsDialogProvider />
      <ReactionPortals />
    </div>
  )
}
