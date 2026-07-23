import React from 'react'
import {
  AudioTrack,
  ParticipantTileProps,
  useEnsureTrackRef,
  useFeatureContext,
  useMaybeTrackRefContext,
  useParticipantTile,
  VideoTrack,
  TrackRefContext,
  ParticipantContextIfNeeded,
} from '@livekit/components-react'
import {
  isEqualTrackRef,
  isTrackReference,
  TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import { Track } from 'livekit-client'
import { ParticipantPlaceholder } from './ParticipantPlaceholder'
import { ParticipantTileFocus } from './ParticipantTileFocus'
import { FullScreenShareWarning } from './FullScreenShareWarning'
import { getParticipantName } from '@/features/rooms/utils/getParticipantName'
import { useTranslation } from 'react-i18next'
import { getShortcutDescriptorById } from '@/features/shortcuts/catalog'
import { formatShortcutLabel } from '@/features/shortcuts/formatLabels'
import { KeyboardShortcutHint } from './KeyboardShortcutHint'
import { layoutStore, clearPinnedTrack } from '@/stores/layout'
import { ParticipantMetadata } from './ParticipantMetadata'
import { getParticipantColor } from '@/features/rooms/utils/getParticipantColor'

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
  const autoManageSubscription = useFeatureContext()?.autoSubscription

  const handleSubscribe = React.useCallback(
    (subscribed: boolean) => {
      if (
        trackReference.source &&
        !subscribed &&
        layoutStore.pinnedTrackRef &&
        isEqualTrackRef(trackReference, layoutStore.pinnedTrackRef)
      ) {
        clearPinnedTrack()
      }
    },
    [trackReference]
  )

  const isScreenShare = trackReference.source != Track.Source.Camera
  const [hasKeyboardFocus, setHasKeyboardFocus] = React.useState(false)

  const participantColor = getParticipantColor(trackReference.participant)

  const participantName = getParticipantName(trackReference.participant)
  const { t } = useTranslation('rooms', { keyPrefix: 'participantTileFocus' })

  const interactiveProps = {
    ...elementProps,
    // Ensure the tile is focusable to expose contextual controls to keyboard users.
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

  return (
    <div ref={ref} style={{ position: 'relative' }} {...interactiveProps}>
      <TrackRefContextIfNeeded trackRef={trackReference}>
        <ParticipantContextIfNeeded participant={trackReference.participant}>
          {trackReference.participant.isLocal && (
            <FullScreenShareWarning trackReference={trackReference} />
          )}
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
                  color={participantColor}
                  displayedNamed={
                    trackReference.participant.name ||
                    trackReference.participant.identity
                  }
                />
              </div>
              {!disableMetadata && (
                <ParticipantMetadata
                  isScreenShare={isScreenShare}
                  participant={trackReference.participant}
                />
              )}
            </>
          )}
          {!disableMetadata && !disableTileControls && (
            <ParticipantTileFocus
              trackRef={trackReference}
              hasKeyboardFocus={hasKeyboardFocus}
            />
          )}
        </ParticipantContextIfNeeded>
      </TrackRefContextIfNeeded>
      <KeyboardShortcutHint
        hint={t('toolbarHint', {
          shortcut: formatShortcutLabel(
            getShortcutDescriptorById('open-shortcuts')?.shortcut
          ),
        })}
      />
    </div>
  )
})
