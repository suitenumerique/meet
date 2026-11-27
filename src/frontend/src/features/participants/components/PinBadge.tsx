import { Participant, Track } from 'livekit-client'
import { css } from '@/styled-system/css'
import { useMemo } from 'react'
import { useSnapshot } from 'valtio'
import { layoutStore } from '@/stores/layout'
import { isEqualTrackRef } from '@livekit/components-core'
import { Icon } from '@/primitives/Icon'
import Source = Track.Source

export const PinBadge = ({ participant }: { participant: Participant }) => {
  const cameraTrackRef = useMemo(() => {
    return {
      participant: participant,
      publication: participant.getTrackPublication(Source.Camera),
      source: Source.Camera,
    }
  }, [participant])

  const screenShareTrackRef = useMemo(() => {
    return {
      participant: participant,
      publication: participant.getTrackPublication(Source.ScreenShare),
      source: Source.ScreenShare,
    }
  }, [participant])

  const { pinnedTrackRef } = useSnapshot(layoutStore)
  const inFocus =
    isEqualTrackRef(pinnedTrackRef, cameraTrackRef) ||
    isEqualTrackRef(pinnedTrackRef, screenShareTrackRef)

  if (!inFocus) return

  return (
    <div
      className={css({
        height: '18px',
        width: '18px',
        borderRadius: '100%',
        background: 'white',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        bottom: '-2px',
        right: '-4px',
      })}
    >
      <Icon name="pin-filled" size={14} />
    </div>
  )
}
