import {
  isEqualTrackRef,
  TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { clearPinnedTrack, layoutStore, setPinnedTrack } from '@/stores/layout'
import { Button } from '@/primitives'
import { RiPushpin2Line, RiUnpinLine } from '@remixicon/react'

export const FocusButton = ({
  trackRef,
}: {
  trackRef: TrackReferenceOrPlaceholder
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participantTileFocus' })

  const { pinnedTrackRef } = useSnapshot(layoutStore)
  const inFocus = isEqualTrackRef(trackRef, pinnedTrackRef)

  return (
    <Button
      size="sm"
      variant="primaryTextDark"
      square
      tooltip={inFocus ? t('pin.disable') : t('pin.enable')}
      onPress={() => (inFocus ? clearPinnedTrack() : setPinnedTrack(trackRef))}
    >
      {inFocus ? <RiUnpinLine /> : <RiPushpin2Line />}
    </Button>
  )
}
