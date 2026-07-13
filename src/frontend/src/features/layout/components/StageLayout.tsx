import { FocusLayoutContainer, useTracks } from '@livekit/components-react'
import { CarouselLayout } from '@/features/layout/components/CarouselLayout'
import { FocusLayout } from '@/features/layout/components/FocusLayout'
import { ParticipantTile } from '@/features/rooms/livekit/components/ParticipantTile'
import { GridLayout } from '@/features/layout/components/GridLayout'
import {
  isEqualTrackRef,
  isTrackReference,
  log,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import { RoomEvent, Track } from 'livekit-client'
import { useSnapshot } from 'valtio'
import { clearPinnedTrack, layoutStore, setPinnedTrack } from '@/stores/layout'
import { useEffect, useRef } from 'react'

export const StageLayout = () => {
  const lastAutoFocusedScreenShareTrack =
    useRef<TrackReferenceOrPlaceholder | null>(null)

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false }
  )

  const screenShareTracks = tracks
    .filter(isTrackReference)
    .filter((track) => track.publication.source === Track.Source.ScreenShare)

  const { pinnedTrackRef } = useSnapshot(layoutStore)

  const carouselTracks = tracks.filter(
    (track) => !isEqualTrackRef(track, pinnedTrackRef)
  )

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
      setPinnedTrack(screenShareTracks[0])
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
      clearPinnedTrack()
      lastAutoFocusedScreenShareTrack.current = null
    }
    if (pinnedTrackRef && !isTrackReference(pinnedTrackRef)) {
      const updatedFocusTrack = tracks.find(
        (tr) =>
          tr.participant.identity === pinnedTrackRef.participant.identity &&
          tr.source === pinnedTrackRef.source
      )
      if (
        updatedFocusTrack !== pinnedTrackRef &&
        isTrackReference(updatedFocusTrack)
      ) {
        setPinnedTrack(updatedFocusTrack)
      }
    }
  }, [
    screenShareTracks
      .map(
        (ref) => `${ref.publication.trackSid}_${ref.publication.isSubscribed}`
      )
      .join(),
    pinnedTrackRef?.publication?.trackSid,
    tracks,
  ])
  /* eslint-enable react-hooks/exhaustive-deps */

  return (
    <>
      {!pinnedTrackRef ? (
        <div className="lk-grid-layout-wrapper" style={{ height: 'auto' }}>
          <GridLayout tracks={tracks} style={{ padding: 0 }}>
            <ParticipantTile />
          </GridLayout>
        </div>
      ) : (
        <div className="lk-focus-layout-wrapper" style={{ height: 'auto' }}>
          <FocusLayoutContainer style={{ padding: 0 }}>
            <CarouselLayout
              tracks={carouselTracks}
              style={{
                minWidth: '200px',
              }}
            >
              <ParticipantTile />
            </CarouselLayout>
            {pinnedTrackRef && <FocusLayout trackRef={pinnedTrackRef} />}
          </FocusLayoutContainer>
        </div>
      )}
    </>
  )
}
