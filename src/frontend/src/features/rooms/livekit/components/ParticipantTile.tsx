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
import { useRaisedHand, useRaisedHandPosition } from '../hooks/useRaisedHand'
import { HStack } from '@/styled-system/jsx'
import { MutedMicIndicator } from './MutedMicIndicator'
import { ParticipantPlaceholder } from './ParticipantPlaceholder'
import { ParticipantTileFocus } from './ParticipantTileFocus'
import { FullScreenShareWarning } from './FullScreenShareWarning'
import { ScreenShareZoomableVideo } from './ScreenShareZoomableVideo'
import { ParticipantName } from './ParticipantName'
import { getParticipantName } from '@/features/rooms/utils/getParticipantName'
import { useTranslation } from 'react-i18next'
import { getShortcutDescriptorById } from '@/features/shortcuts/catalog'
import { formatShortcutLabel } from '@/features/shortcuts/formatLabels'
import { KeyboardShortcutHint } from './KeyboardShortcutHint'

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
  disableTileControls?: boolean
}

const MOUSE_IDLE_TIME = 3000

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
    disableTileControls,
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

  const { positionInQueue, firstInQueue } = useRaisedHandPosition({
    participant: trackReference.participant,
  })

  const isScreenShare = trackReference.source != Track.Source.Camera
  const isRemoteScreenShare =
    isScreenShare && !trackReference.participant.isLocal
  const [hasKeyboardFocus, setHasKeyboardFocus] = React.useState(false)

  // Hover + idle tracking for the focus overlay (pin, effects, mute buttons).
  const [isTileHovered, setIsTileHovered] = React.useState(false)
  const [isIdle, setIsIdle] = React.useState(false)
  const idleTimerRef = React.useRef<number | null>(null)

  const handleTileMouseMove = React.useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    idleTimerRef.current = window.setTimeout(
      () => setIsIdle(true),
      MOUSE_IDLE_TIME
    )
    setIsIdle(false)
  }, [])

  const isOverlayVisible = hasKeyboardFocus || (isTileHovered && !isIdle)

  // tileRef: fullscreen target. setRefs merges it with the forwarded ref on the same node.
  const tileRef = React.useRef<HTMLDivElement>(null)
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      ;(tileRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      if (typeof ref === 'function') ref(node)
      else if (ref)
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
    },
    [ref]
  )

  const participantName = getParticipantName(trackReference.participant)
  const { t } = useTranslation('rooms', { keyPrefix: 'participantTileFocus' })

  const interactiveProps = {
    ...elementProps,
    tabIndex: 0,
    'aria-label': t('containerLabel', { name: participantName }),
    onFocus: (event: React.FocusEvent<HTMLDivElement>) => {
      elementProps.onFocus?.(event)
      const target = event.target as HTMLElement | null
      const isFocusVisible = !!target?.matches?.(':focus-visible')
      setHasKeyboardFocus(isFocusVisible)
    },
    onBlur: (event: React.FocusEvent<HTMLDivElement>) => {
      elementProps.onBlur?.(event)
      const nextTarget = event.relatedTarget as Node | null
      if (!event.currentTarget.contains(nextTarget)) {
        setHasKeyboardFocus(false)
      }
    },
  }

  const isVideoTrack =
    isTrackReference(trackReference) &&
    (trackReference.publication?.kind === 'video' ||
      trackReference.source === Track.Source.Camera ||
      trackReference.source === Track.Source.ScreenShare)

  let trackMedia: React.ReactNode = null
  if (isVideoTrack) {
    if (isRemoteScreenShare) {
      trackMedia = (
        <ScreenShareZoomableVideo
          trackRef={trackReference}
          tileRef={tileRef}
          onSubscriptionStatusChanged={handleSubscribe}
          manageSubscription={autoManageSubscription}
        />
      )
    } else {
      trackMedia = (
        <VideoTrack
          trackRef={trackReference}
          onSubscriptionStatusChanged={handleSubscribe}
          manageSubscription={autoManageSubscription}
        />
      )
    }
  } else if (isTrackReference(trackReference)) {
    trackMedia = (
      <AudioTrack
        trackRef={trackReference}
        onSubscriptionStatusChanged={handleSubscribe}
      />
    )
  }

  return (
    <div
      ref={setRefs}
      style={{ position: 'relative' }}
      {...interactiveProps}
      onMouseEnter={() => setIsTileHovered(true)}
      onMouseLeave={() => {
        setIsTileHovered(false)
        setIsIdle(false)
        if (idleTimerRef.current) {
          window.clearTimeout(idleTimerRef.current)
          idleTimerRef.current = null
        }
      }}
      onMouseMove={handleTileMouseMove}
    >
      <TrackRefContextIfNeeded trackRef={trackReference}>
        <ParticipantContextIfNeeded participant={trackReference.participant}>
          <FullScreenShareWarning trackReference={trackReference} />
          {children ?? (
            <>
              {trackMedia}
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
                          isHandRaised && !isScreenShare
                            ? firstInQueue
                              ? '#fde047'
                              : 'white'
                            : undefined,
                        color:
                          isHandRaised && !isScreenShare ? 'black' : undefined,
                        transition: 'background 200ms ease, color 400ms ease',
                      }}
                    >
                      {isHandRaised && !isScreenShare && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.1rem',
                          }}
                        >
                          <span>{positionInQueue}</span>
                          <RiHand
                            color="black"
                            size={16}
                            style={{
                              marginRight: '0.4rem',
                              marginLeft: '0.1rem',
                              minWidth: '16px',
                              animationDuration: '300ms',
                              animationName: 'wave_hand',
                              animationIterationCount: '2',
                            }}
                          />
                        </span>
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
                      <div className="lk-participant-name-wrapper">
                        <ParticipantName
                          isScreenShare={isScreenShare}
                          participant={trackReference.participant}
                        />
                      </div>
                    </div>
                  </HStack>
                  <ConnectionQualityIndicator className="lk-participant-metadata-item" />
                </div>
              )}
            </>
          )}
          {!disableMetadata && !disableTileControls && (
            <ParticipantTileFocus
              trackRef={trackReference}
              isVisible={isOverlayVisible}
            />
          )}
        </ParticipantContextIfNeeded>
      </TrackRefContextIfNeeded>
      <KeyboardShortcutHint>
        {t('toolbarHint', {
          shortcut: formatShortcutLabel(
            getShortcutDescriptorById('open-shortcuts')?.shortcut
          ),
        })}
      </KeyboardShortcutHint>
    </div>
  )
})
