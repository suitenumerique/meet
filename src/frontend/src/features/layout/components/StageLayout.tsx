import {
  FocusLayoutContainer,
  useParticipantInfo,
  useTracks,
  VideoTrack,
} from '@livekit/components-react'
import { CarouselLayout } from '@/features/layout/components/CarouselLayout'
import { FocusLayout } from '@/features/layout/components/FocusLayout'
import { ParticipantTile } from '@/features/participantTile/components/ParticipantTile'
import { GridLayout } from '@/features/layout/components/GridLayout'
import { ScreenShareZoomableVideo } from '@/features/rooms/livekit/components/ScreenShareZoomableVideo'
import {
  isEqualTrackRef,
  isTrackReference,
  log,
  type TrackReference,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import { Track } from 'livekit-client'
import { useSnapshot } from 'valtio'
import { clearPinnedTrack, layoutStore, setPinnedTrack } from '@/stores/layout'
import {
  closeScreenSharePopout,
  screenSharePopoutStore,
} from '@/stores/screenSharePopout'
import { useEffect, useRef } from 'react'

// Only the media part of the tile: it is what the other window shows (video,
// zoom bar, fullscreen, bring-back button). The rest of the tile would stay
// hidden anyway. Hidden so a screen reader and the keyboard don't find the
// same share twice.
const DetachedScreenShare = ({ trackRef }: { trackRef: TrackReference }) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const { identity, name } = useParticipantInfo({
    participant: trackRef.participant,
  })

  return (
    <div ref={hostRef} hidden>
      <ScreenShareZoomableVideo
        tileRef={hostRef}
        participantName={name || identity || 'Unknown'}
        trackSid={trackRef.publication.trackSid}
      >
        <VideoTrack trackRef={trackRef} />
      </ScreenShareZoomableVideo>
    </div>
  )
}

export const StageLayout = () => {
  const lastAutoFocusedScreenShareTrack =
    useRef<TrackReferenceOrPlaceholder | null>(null)

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [], onlySubscribed: false }
  )

  const screenShareTracks = tracks
    .filter(isTrackReference)
    .filter((track) => track.publication.source === Track.Source.ScreenShare)

  const { pinnedTrackRef } = useSnapshot(layoutStore)
  const { entry: popoutEntry } = useSnapshot(screenSharePopoutStore)
  const detachedSid = popoutEntry?.trackSid

  // The popped-out share stays mounted below, but out of the grid and the
  // carousel. It comes back with the other tracks when its window closes.
  const visibleTracks: TrackReferenceOrPlaceholder[] = []
  let detachedTrack: TrackReference | undefined
  for (const track of tracks) {
    if (isTrackReference(track) && track.publication.trackSid === detachedSid) {
      detachedTrack = track
    } else {
      visibleTracks.push(track)
    }
  }

  const carouselTracks = visibleTracks.filter(
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

  const screenShareKey = screenShareTracks
    .map((track) => track.publication.trackSid)
    .join()

  // The popped-out tile is kept mounted below, so nothing else notices when
  // the share stops. Close the window here instead.
  // The snapshot above is for the layout. Here we read the store itself,
  // to get the window that's open at this moment.
  useEffect(() => {
    const entry = screenSharePopoutStore.entry
    if (!entry) return
    const alive = screenShareTracks.some(
      (track) => track.publication.trackSid === entry.trackSid
    )
    if (!alive) closeScreenSharePopout({ restorePin: false })
    // screenShareKey is the sid list; the array itself is new every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenShareKey])

  return (
    <>
      {detachedTrack && <DetachedScreenShare trackRef={detachedTrack} />}
      {!pinnedTrackRef ? (
        <div className="lk-grid-layout-wrapper" style={{ height: 'auto' }}>
          <GridLayout tracks={visibleTracks} style={{ padding: 0 }}>
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
            <FocusLayout trackRef={pinnedTrackRef} />
          </FocusLayoutContainer>
        </div>
      )}
    </>
  )
}
