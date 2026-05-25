import { ParticipantTile } from './ParticipantTile'
import type { FocusLayoutProps } from '@livekit/components-react'

export function FocusLayout({ trackRef, ...htmlProps }: FocusLayoutProps) {
  return <ParticipantTile trackRef={trackRef} {...htmlProps} />
}
