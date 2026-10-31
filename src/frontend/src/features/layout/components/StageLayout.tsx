import { FocusLayoutContainer, useTracks } from '@livekit/components-react'
import { CarouselLayout } from '@/features/layout/components/CarouselLayout'
import { FocusLayout } from '@/features/layout/components/FocusLayout'
import { ParticipantTile } from '@/features/participantTile/components/ParticipantTile'
import { GridLayout } from '@/features/layout/components/GridLayout'
import {
  isEqualTrackRef,
  isTrackReference,
  log,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import { Track } from 'livekit-client'
import { useSnapshot } from 'valtio'
import { clearPinnedTrack, layoutStore, setPinnedTrack } from '@/stores/layout'
import { focusLayoutStore } from '@/stores/focusLayout'
import { type CSSProperties, useEffect, useRef } from 'react'
import { useSize } from '@/features/rooms/livekit/hooks/useResizeObserver'
import { useMediaQuery } from '@/features/rooms/livekit/hooks/useMediaQuery'
import {
  clampCarouselRatio,
  RESIZABLE_MEDIA_QUERY,
} from '@/features/layout/utils/focusLayoutSplit'
import {
  CAROUSEL_RATIO_VAR,
  FocusLayoutResizer,
} from '@/features/layout/components/FocusLayoutResizer'

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
        <ResizableFocusLayout
          carouselTracks={carouselTracks}
          pinnedTrackRef={pinnedTrackRef}
        />
      )}
    </>
  )
}

interface ResizableFocusLayoutProps {
  carouselTracks: TrackReferenceOrPlaceholder[]
  pinnedTrackRef: TrackReferenceOrPlaceholder
}

// Kept apart from StageLayout so the size observer attaches when the wrapper
// mounts, which only happens once a track is pinned.
const ResizableFocusLayout = ({
  carouselTracks,
  pinnedTrackRef,
}: ResizableFocusLayoutProps) => {
  const focusLayoutRef = useRef<HTMLDivElement>(null)
  const { width: focusLayoutWidth } = useSize(focusLayoutRef)
  const isResizable = useMediaQuery(RESIZABLE_MEDIA_QUERY)
  const { carouselRatio } = useSnapshot(focusLayoutStore)
  const clampedCarouselRatio = clampCarouselRatio(
    carouselRatio,
    focusLayoutWidth
  )

  return (
    <div
      ref={focusLayoutRef}
      className="lk-focus-layout-wrapper"
      style={
        {
          height: 'auto',
          [CAROUSEL_RATIO_VAR]: clampedCarouselRatio,
        } as CSSProperties
      }
    >
      <FocusLayoutContainer
        style={{
          padding: 0,
          ...(isResizable && {
            gridTemplateColumns: `calc(var(${CAROUSEL_RATIO_VAR}) * 100%) minmax(0, 1fr)`,
          }),
        }}
      >
        <CarouselLayout
          tracks={carouselTracks}
          orientation={isResizable ? 'vertical' : undefined}
          style={{
            minWidth: '200px',
          }}
        >
          <ParticipantTile />
        </CarouselLayout>
        <FocusLayout trackRef={pinnedTrackRef} />
      </FocusLayoutContainer>
      {isResizable && (
        <FocusLayoutResizer
          containerRef={focusLayoutRef}
          ratio={clampedCarouselRatio}
          layoutWidth={focusLayoutWidth}
        />
      )}
    </div>
  )
}
