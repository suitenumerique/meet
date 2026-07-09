import { VideoTrack } from '@livekit/components-react'
import { type TrackReference } from '@livekit/components-core'
import { memo } from 'react'

interface ScreenShareVideoTrackProps {
  trackRef: TrackReference
  onSubscriptionStatusChanged: (subscribed: boolean) => void
  manageSubscription?: boolean
}

// Zoom/pan updates the wrapper transform only; skip VideoTrack re-renders.
export const ScreenShareVideoTrack = memo(
  ({
    trackRef,
    onSubscriptionStatusChanged,
    manageSubscription,
  }: ScreenShareVideoTrackProps) => (
    <VideoTrack
      trackRef={trackRef}
      onSubscriptionStatusChanged={onSubscriptionStatusChanged}
      manageSubscription={manageSubscription}
    />
  )
)

ScreenShareVideoTrack.displayName = 'ScreenShareVideoTrack'
