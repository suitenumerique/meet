import {
  FocusLayoutContainer,
  useMaybeLayoutContext,
  usePinnedTracks,
  useRoomContext,
  useTracks,
} from '@livekit/components-react'
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
import { type Participant, RoomEvent, Track } from 'livekit-client'
import { useCallback, useEffect, useRef } from 'react'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { useTranslation } from 'react-i18next'
import { getParticipantName } from '@/features/rooms/utils/getParticipantName'


export const StageLayout = () => {

  const lastAutoFocusedScreenShareTrack =
    useRef<TrackReferenceOrPlaceholder | null>(null)

  const lastPinnedParticipantIdentityRef = useRef<string | null>(null)

  const layoutContext = useMaybeLayoutContext()

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

  const focusTrack = usePinnedTracks(layoutContext)?.[0]
  const carouselTracks = tracks.filter(
    (track) => !isEqualTrackRef(track, focusTrack)
  )

  // // handle pin announcements

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

    if (!layoutContext) return

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


  return (
    <>
      {!focusTrack ? (
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
            {focusTrack && <FocusLayout trackRef={focusTrack} />}
          </FocusLayoutContainer>
        </div>
      )}
    </>
  )
}