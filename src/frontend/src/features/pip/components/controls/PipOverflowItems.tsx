import React from 'react'
import { MenuItem } from 'react-aria-components'
import {
  RiHand,
  RiClosedCaptioningLine,
  RiArrowUpLine,
  RiEmotionLine,
} from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { Track } from 'livekit-client'
import { pipLayoutStore } from '@/features/pip/stores/pipLayoutStore'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useRoomContext, useTrackToggle } from '@livekit/components-react'
import { useRaisedHand } from '@/features/rooms/livekit/hooks/useRaisedHand'
import { useSubtitles } from '@/features/subtitle/hooks/useSubtitles'
import { useAreSubtitlesAvailable } from '@/features/subtitle/hooks/useAreSubtitlesAvailable'
import { useSnapshot } from 'valtio'
import { CollapsibleControls, type CollapsibleControl } from '../PipControlBar'

type PipOverflowItemsProps = {
  overflowControls: Set<CollapsibleControl>
}

export const PipOverflowItems = ({
  overflowControls,
}: PipOverflowItemsProps) => {
  const { t } = useTranslation('rooms')
  const room = useRoomContext()
  const { isHandRaised, toggleRaisedHand } = useRaisedHand({
    participant: room.localParticipant,
  })
  const { areSubtitlesOpen, toggleSubtitles } = useSubtitles()
  const areSubtitlesAvailable = useAreSubtitlesAvailable()
  const { buttonProps: screenShareProps, enabled: isScreenSharing } =
    useTrackToggle({
      source: Track.Source.ScreenShare,
      captureOptions: { audio: true, selfBrowserSurface: 'include' },
    })
  const pipLayoutSnap = useSnapshot(pipLayoutStore)
  const toggleReactions = () => {
    pipLayoutStore.showReactionsToolbar = !pipLayoutSnap.showReactionsToolbar
  }
  const itemClass = menuRecipe({ icon: true, variant: 'dark' }).item

  return (
    <>
      {overflowControls.has(CollapsibleControls.REACTIONS) && (
        <MenuItem onAction={toggleReactions} className={itemClass}>
          <RiEmotionLine size={20} />
          {t('controls.reactions.button')}
        </MenuItem>
      )}
      {overflowControls.has(CollapsibleControls.SCREEN_SHARE) && (
        <MenuItem
          onAction={() => screenShareProps.onClick?.({} as React.MouseEvent<HTMLButtonElement>)}
          className={itemClass}
        >
          <RiArrowUpLine size={20} />
          {t(isScreenSharing ? 'controls.screenShare.stop' : 'controls.screenShare.start')}
        </MenuItem>
      )}
      {overflowControls.has(CollapsibleControls.SUBTITLES) && areSubtitlesAvailable && (
        <MenuItem onAction={toggleSubtitles} className={itemClass}>
          <RiClosedCaptioningLine size={20} />
          {areSubtitlesOpen
            ? t('controls.subtitles.open')
            : t('controls.subtitles.closed')}
        </MenuItem>
      )}
      {overflowControls.has(CollapsibleControls.HAND) && (
        <MenuItem onAction={toggleRaisedHand} className={itemClass}>
          <RiHand size={20} />
          {isHandRaised ? t('controls.hand.lower') : t('controls.hand.raise')}
        </MenuItem>
      )}
    </>
  )
}
