import { Participant, Track } from 'livekit-client'
import { menuRecipe } from '@/primitives/menuRecipe'
import { HStack } from '@/styled-system/jsx'
import { RiPushpin2Line, RiUnpinLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { clearPinnedTrack, layoutStore, setPinnedTrack } from '@/stores/layout'
import { isEqualTrackRef } from '@livekit/components-core'
import Source = Track.Source
import { useMemo } from 'react'

export const PinMenuItem = ({ participant }: { participant: Participant }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participantMenu' })

  const trackRef = useMemo(() => {
    return {
      participant: participant,
      publication: participant.getTrackPublication(Source.Camera),
      source: Source.Camera,
    }
  }, [participant])

  const { pinnedTrackRef } = useSnapshot(layoutStore)
  const inFocus = isEqualTrackRef(pinnedTrackRef, trackRef)

  return (
    <MenuItem
      aria-label={t(`${inFocus ? 'unpin' : 'pin'}.ariaLabel`, {
        name: participant.name,
      })}
      className={menuRecipe({ icon: true }).item}
      onAction={() => (inFocus ? clearPinnedTrack() : setPinnedTrack(trackRef))}
    >
      <HStack gap={0.25}>
        {inFocus ? (
          <>
            <RiUnpinLine size={20} aria-hidden />
            {t('unpin.label')}
          </>
        ) : (
          <>
            <RiPushpin2Line size={20} aria-hidden />
            {t('pin.label')}
          </>
        )}
      </HStack>
    </MenuItem>
  )
}
