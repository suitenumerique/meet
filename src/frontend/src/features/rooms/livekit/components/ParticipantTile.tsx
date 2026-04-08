import {
  AudioTrack,
  ConnectionQualityIndicator,
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
import { Track, RoomEvent } from 'livekit-client'
import type { Participant } from 'livekit-client'
import { RiHand } from '@remixicon/react'
import { useRoomContext } from '@livekit/components-react'
import { useRaisedHand, useRaisedHandPosition } from '../hooks/useRaisedHand'
import {
  EncryptionBadge,
  EncryptionIdentityDialog,
} from '@/features/encryption'
import { useParticipantTrustLevel } from '@/features/encryption/useParticipantTrustLevel'
import { useRoomData } from '../hooks/useRoomData'
import { isEncryptedRoom as checkEncryptedRoom } from '@/features/rooms/api/ApiRoom'
import { useIsAdminOrOwner } from '../hooks/useIsAdminOrOwner'
import { RiLockFill } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { Button } from '@/primitives'
import { MutedMicIndicator } from './MutedMicIndicator'
import { ParticipantPlaceholder } from './ParticipantPlaceholder'
import { ParticipantTileFocus } from './ParticipantTileFocus'
import { FullScreenShareWarning } from './FullScreenShareWarning'
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
  const roomData = useRoomData()
  const isEncryptedRoom = checkEncryptedRoom(roomData)
  const isAdmin = useIsAdminOrOwner()
  const [isIdentityOpen, setIsFingerprintOpen] = React.useState(false)
  const participantAttrs = trackReference.participant.attributes as Record<string, string> | undefined
  const { trustLevel, fingerprintStatus, fingerprint: participantFingerprint } = useParticipantTrustLevel(participantAttrs, roomData?.encryption_mode, trackReference.participant.isLocal)
  const { t: tBadge } = useTranslation('rooms', { keyPrefix: 'encryption.badge' })
  const badgeTooltip = tBadge(trustLevel)

  // Track decryption failures via EncryptionError events from LiveKit.
  // useIsEncrypted returns true when E2EE is enabled, NOT when frames decrypt successfully.
  // So we listen for actual decryption errors to know when to show the overlay.
  const room = useRoomContext()
  const [decryptionFailed, setDecryptionFailed] = React.useState(false)

  React.useEffect(() => {
    if (!isEncryptedRoom || trackReference.participant.isLocal) return

    const participantIdentity = trackReference.participant.identity

    const handleEncryptionError = (_error: Error, participant?: Participant) => {
      if (participant?.identity === participantIdentity) {
        setDecryptionFailed(true)
      }
    }

    const handleEncryptionStatusChanged = (encrypted: boolean, participant?: Participant) => {
      // Clear the error when encryption status confirms frames are decrypting
      if (participant?.identity === participantIdentity && encrypted) {
        setDecryptionFailed(false)
      }
    }

    room.on(RoomEvent.EncryptionError, handleEncryptionError)
    room.on(RoomEvent.ParticipantEncryptionStatusChanged, handleEncryptionStatusChanged)
    return () => {
      room.off(RoomEvent.EncryptionError, handleEncryptionError)
      room.off(RoomEvent.ParticipantEncryptionStatusChanged, handleEncryptionStatusChanged)
    }
  }, [room, isEncryptedRoom, trackReference.participant])

  const showDecryptionError =
    !trackReference.participant.isLocal &&
    isEncryptedRoom &&
    decryptionFailed
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
  const [hasKeyboardFocus, setHasKeyboardFocus] = React.useState(false)

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
              {showDecryptionError && !isScreenShare && (
                <div
                  className={css({
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: '0 !important',
                    pointerEvents: 'none',
                  })}
                >
                  <ParticipantPlaceholder
                    participant={trackReference.participant}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '2.5rem',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: 'rgba(0, 0, 0, 0.75)',
                      borderRadius: '0.5rem',
                      padding: '0.6rem 1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.3rem',
                      maxWidth: '85%',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        color: '#f87171',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                      }}
                    >
                      <RiLockFill size={14} />
                      <span>Decryption failed</span>
                    </div>
                    <div
                      style={{
                        color: '#d1d5db',
                        fontSize: '0.75rem',
                        textAlign: 'center',
                        lineHeight: 1.4,
                      }}
                    >
                      Check that you and this person are using the correct
                      meeting link. If they are the only one you can&apos;t see,
                      the issue is likely on their side.
                    </div>
                  </div>
                </div>
              )}
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
                      {isEncryptedRoom && !isScreenShare ? (
                        <Button
                          variant="greyscale"
                          size="sm"
                          tooltip={badgeTooltip}
                          aria-label={badgeTooltip}
                          onPress={() => setIsFingerprintOpen(true)}
                          className={css({
                            display: 'inline-flex !important',
                            alignItems: 'center !important',
                            gap: '0.15rem !important',
                            padding: '0.1rem 0.15rem !important',
                            minWidth: 'auto !important',
                            height: 'auto !important',
                            position: 'relative',
                            zIndex: 10,
                            borderRadius: '0.25rem !important',
                            backgroundColor: 'transparent !important',
                            color: 'inherit !important',
                            '&[data-hovered]': {
                              backgroundColor: 'rgba(255, 255, 255, 0.15) !important',
                            },
                          })}
                        >
                          {(isEncrypted || isEncryptedRoom) && (
                            <EncryptionBadge
                              isEncrypted={true}
                              trustLevel={trustLevel}
                            />
                          )}
                          <div className="lk-participant-name-wrapper">
                            <ParticipantName
                              isScreenShare={isScreenShare}
                              participant={trackReference.participant}
                            />
                          </div>
                        </Button>
                      ) : (
                        <>
                          {(isEncrypted || isEncryptedRoom) && !isScreenShare && (
                            <EncryptionBadge
                              isEncrypted={true}
                              trustLevel={trustLevel}
                            />
                          )}
                          <div className="lk-participant-name-wrapper">
                            <ParticipantName
                              isScreenShare={isScreenShare}
                              participant={trackReference.participant}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </HStack>
                  <ConnectionQualityIndicator className="lk-participant-metadata-item" />
                </div>
              )}
            </>
          )}
          {!disableMetadata && (
            <ParticipantTileFocus
              trackRef={trackReference}
              hasKeyboardFocus={hasKeyboardFocus}
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
      {isEncryptedRoom && (
        <EncryptionIdentityDialog
          isOpen={isIdentityOpen}
          onOpenChange={setIsFingerprintOpen}
          participantName={trackReference.participant.name || trackReference.participant.identity}
          participantEmail={participantAttrs?.email}
          suiteUserId={participantAttrs?.suite_user_id}
          isAuthenticated={participantAttrs?.is_authenticated === 'true'}
          encryptionMode={roomData?.encryption_mode}
          isSelf={trackReference.participant.isLocal}
          preloadedFingerprint={participantFingerprint}
          preloadedFingerprintStatus={fingerprintStatus}
        />
      )}
    </div>
  )
})
