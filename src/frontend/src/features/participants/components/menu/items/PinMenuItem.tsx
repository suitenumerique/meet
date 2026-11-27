import { Participant, Track } from 'livekit-client'
import { menuRecipe } from '@/primitives/menuRecipe'
import { HStack } from '@/styled-system/jsx'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { clearPinnedTrack, layoutStore, setPinnedTrack } from '@/stores/layout'
import { isEqualTrackRef } from '@livekit/components-core'
import Source = Track.Source
import { useMemo } from 'react'
import { Icon } from '@/primitives/Icon'

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
      <HStack gap="3xs">
        {inFocus ? (
          <>
            <Icon name="unpin" size={20} />
            {t('unpin.label')}
          </>
        ) : (
          <>
            <Icon name="pin" size={20} />
            {t('pin.label')}
          </>
        )}
      </HStack>
    </MenuItem>
  )
}
