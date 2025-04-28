import {
  AudioTrack,
  ConnectionQualityIndicator,
  LockLockedIcon,
  ParticipantTileProps,
  ScreenShareIcon,
  useEnsureTrackRef,
  useFeatureContext,
  useIsEncrypted,
  useMaybeLayoutContext,
  useMaybeTrackRefContext,
  useParticipantTile,
  VideoTrack,
  TrackRefContext,
  ParticipantContextIfNeeded,
} from '@livekit/components-react'
import React from 'react'
import {
  isTrackReference,
  isTrackReferencePinned,
  TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import { Track } from 'livekit-client'
import { RiHand } from '@remixicon/react'
import { useRaisedHand } from '../hooks/useRaisedHand'
import { HStack } from '@/styled-system/jsx'
import { MutedMicIndicator } from './MutedMicIndicator'
import { ParticipantPlaceholder } from './ParticipantPlaceholder'
import { ParticipantTileFocus } from './ParticipantTileFocus'
import { FullScreenShareWarning } from './FullScreenShareWarning'
import { ParticipantName } from './ParticipantName'

export function TrackRefContextIfNeeded(
  props: React.PropsWithChildren<{
    trackRef?: TrackReferenceOrPlaceholder
  }>
) {
  const hasContext = !!useMaybeTrackRefContext()
  return props.trackRef && !hasContext ? (
    <TrackRefContext.Provider value={props.trackRef}>
      {props.children}
    </TrackRefContext.Provider>
  ) : (
    <>{props.children}</>
  )
}

interface ParticipantTileExtendedProps extends ParticipantTileProps {
  disableMetadata?: boolean
}

export const ParticipantTile: (
  props: ParticipantTileExtendedProps & React.RefAttributes<HTMLDivElement>
) => React.ReactNode = /* @__PURE__ */ React.forwardRef<
  HTMLDivElement,
  ParticipantTileExtendedProps
>(function ParticipantTile(
  {
    trackRef,
    children,
    onParticipantClick,
    disableSpeakingIndicator,
    disableMetadata,
    ...htmlProps
  }: ParticipantTileExtendedProps,
  ref
) {
  const trackReference = useEnsureTrackRef(trackRef)

  const { elementProps } = useParticipantTile<HTMLDivElement>({
    htmlProps,
    disableSpeakingIndicator,
    onParticipantClick,
    trackRef: trackReference,
  })
  const isEncrypted = useIsEncrypted(trackReference.participant)
  const layoutContext = useMaybeLayoutContext()

  const autoManageSubscription = useFeatureContext()?.autoSubscription

  const handleSubscribe = React.useCallback(
    (subscribed: boolean) => {
      if (
        trackReference.source &&
        !subscribed &&
        layoutContext &&
        layoutContext.pin.dispatch &&
        isTrackReferencePinned(trackReference, layoutContext.pin.state)
      ) {
        layoutContext.pin.dispatch({ msg: 'clear_pin' })
      }
    },
    [trackReference, layoutContext]
  )

  const { isHandRaised } = useRaisedHand({
    participant: trackReference.participant,
  })

  const isScreenShare = trackReference.source != Track.Source.Camera

  return (
    <div ref={ref} style={{ position: 'relative' }} {...elementProps}>
      <TrackRefContextIfNeeded trackRef={trackReference}>
        <ParticipantContextIfNeeded participant={trackReference.participant}>
          <FullScreenShareWarning trackReference={trackReference} />
          {children ?? (
            <>
              {isTrackReference(trackReference) &&
              (trackReference.publication?.kind === 'video' ||
                trackReference.source === Track.Source.Camera ||
                trackReference.source === Track.Source.ScreenShare) ? (
                <VideoTrack
                  trackRef={trackReference}
                  onSubscriptionStatusChanged={handleSubscribe}
                  manageSubscription={autoManageSubscription}
                />
              ) : (
                isTrackReference(trackReference) && (
                  <AudioTrack
                    trackRef={trackReference}
                    onSubscriptionStatusChanged={handleSubscribe}
                  />
                )
              )}
              <div className="lk-participant-placeholder">
                <ParticipantPlaceholder
                  participant={trackReference.participant}
                />
              </div>
              {!disableMetadata && (
                <div className="lk-participant-metadata">
                  <HStack gap={0.25}>
                    {!isScreenShare && (
                      <MutedMicIndicator
                        participant={trackReference.participant}
                      />
                    )}
                    <div
                      className="lk-participant-metadata-item"
                      style={{
                        padding: '0.1rem 0.25rem',
                        backgroundColor:
                          isHandRaised && !isScreenShare ? 'white' : undefined,
                        color:
                          isHandRaised && !isScreenShare ? 'black' : undefined,
                        transition: 'background 200ms ease, color 400ms ease',
                      }}
                    >
                      {isHandRaised && !isScreenShare && (
                        <RiHand
                          color="black"
                          size={16}
                          style={{
                            marginRight: '0.4rem',
                            minWidth: '16px',
                            animationDuration: '300ms',
                            animationName: 'wave_hand',
                            animationIterationCount: '2',
                          }}
                        />
                      )}
                      {isScreenShare && (
                        <ScreenShareIcon
                          style={{
                            maxWidth: '20px',
                            width: '100%',
                          }}
                        />
                      )}
                      {isEncrypted && !isScreenShare && (
                        <LockLockedIcon style={{ marginRight: '0.25rem' }} />
                      )}
                      <ParticipantName
                        isScreenShare={isScreenShare}
                        participant={trackReference.participant}
                      />
                    </div>
                  </HStack>
                  <ConnectionQualityIndicator className="lk-participant-metadata-item" />
                </div>
              )}
            </>
          )}
          {!disableMetadata && (
            <ParticipantTileFocus trackRef={trackReference} />
          )}
        </ParticipantContextIfNeeded>
      </TrackRefContextIfNeeded>
    </div>
  )
})
