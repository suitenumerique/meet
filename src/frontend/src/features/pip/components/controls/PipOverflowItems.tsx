import { MenuItem } from 'react-aria-components'
import {
  RiHand,
  RiClosedCaptioningLine,
  RiArrowUpLine,
  RiEmotionLine,
} from '@remixicon/react'
import { TFunction } from 'i18next'
import { pipLayoutStore } from '@/features/pip/stores/pipLayoutStore'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useRoomContext } from '@livekit/components-react'
import { useRaisedHand } from '@/features/rooms/livekit/hooks/useRaisedHand'
import { useSubtitles } from '@/features/subtitle/hooks/useSubtitles'
import { useAreSubtitlesAvailable } from '@/features/subtitle/hooks/useAreSubtitlesAvailable'
import { useSnapshot } from 'valtio'
import type { CollapsibleControl } from '../PipControlBar'

type PipOverflowItemsProps = {
  overflowControls: Set<CollapsibleControl>
  t: TFunction<'rooms'>
}

export const PipOverflowItems = ({
  overflowControls,
  t,
}: PipOverflowItemsProps) => {
  const room = useRoomContext()
  const { isHandRaised, toggleRaisedHand } = useRaisedHand({
    participant: room.localParticipant,
  })
  const { areSubtitlesOpen, toggleSubtitles } = useSubtitles()
  const areSubtitlesAvailable = useAreSubtitlesAvailable()
  const pipSnap = useSnapshot(pipLayoutStore)
  const toggleReactions = () => {
    pipLayoutStore.showReactionsToolbar = !pipSnap.showReactionsToolbar
  }
  const itemClass = menuRecipe({ icon: true, variant: 'dark' }).item

  return (
    <>
      {overflowControls.has('reactions') && (
        <MenuItem onAction={toggleReactions} className={itemClass}>
          <RiEmotionLine size={20} />
          {t('controls.reactions.button')}
        </MenuItem>
      )}
      {overflowControls.has('screenShare') && (
        <MenuItem
          onAction={() => {
            /* screen share requires track toggle, handled externally */
          }}
          className={itemClass}
        >
          <RiArrowUpLine size={20} />
          {t('controls.screenShare.start')}
        </MenuItem>
      )}
      {overflowControls.has('subtitles') && areSubtitlesAvailable && (
        <MenuItem onAction={toggleSubtitles} className={itemClass}>
          <RiClosedCaptioningLine size={20} />
          {areSubtitlesOpen
            ? t('controls.subtitles.open')
            : t('controls.subtitles.closed')}
        </MenuItem>
      )}
      {overflowControls.has('hand') && (
        <MenuItem onAction={toggleRaisedHand} className={itemClass}>
          <RiHand size={20} />
          {isHandRaised ? t('controls.hand.lower') : t('controls.hand.raise')}
        </MenuItem>
      )}
    </>
  )
}
