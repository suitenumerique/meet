import React from 'react'
import { MenuItem } from 'react-aria-components'
import { RiHand, RiArrowUpLine, RiEmotionLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { Track } from 'livekit-client'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useRoomContext, useTrackToggle } from '@livekit/components-react'
import { useRaisedHand } from '@/features/rooms/livekit/hooks/useRaisedHand'
import { useReactionsToolbar } from '@/features/reactions/hooks/useReactionsToolbar'
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
  const { buttonProps: screenShareProps, enabled: isScreenSharing } =
    useTrackToggle({
      source: Track.Source.ScreenShare,
      captureOptions: { audio: true, selfBrowserSurface: 'include' },
    })
  const { toggle: toggleReactions } = useReactionsToolbar()
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
          onAction={() =>
            screenShareProps.onClick?.(
              {} as React.MouseEvent<HTMLButtonElement>
            )
          }
          className={itemClass}
        >
          <RiArrowUpLine size={20} />
          {t(
            isScreenSharing
              ? 'controls.screenShare.stop'
              : 'controls.screenShare.start'
          )}
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
