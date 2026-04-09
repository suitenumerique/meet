import { Menu as RACMenu, MenuItem, MenuSection } from 'react-aria-components'
import {
  RiHand,
  RiClosedCaptioningLine,
  RiArrowUpLine,
  RiEmotionLine,
} from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { Separator } from '@/primitives/Separator'
import { SettingsMenuItem } from '@/features/rooms/livekit/components/controls/Options/SettingsMenuItem'
import { FeedbackMenuItem } from '@/features/rooms/livekit/components/controls/Options/FeedbackMenuItem'
import { EffectsMenuItem } from '@/features/rooms/livekit/components/controls/Options/EffectsMenuItem'
import { SupportMenuItem } from '@/features/rooms/livekit/components/controls/Options/SupportMenuItem'
import { PictureInPictureMenuItem } from '@/features/rooms/livekit/components/controls/Options/PictureInPictureMenuItem'
import { pipLayoutStore } from '@/features/pip/stores/pipLayoutStore'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useRoomContext } from '@livekit/components-react'
import { useRaisedHand } from '@/features/rooms/livekit/hooks/useRaisedHand'
import { useSubtitles } from '@/features/subtitle/hooks/useSubtitles'
import { useAreSubtitlesAvailable } from '@/features/subtitle/hooks/useAreSubtitlesAvailable'
import { useSnapshot } from 'valtio'
import type { CollapsibleControl } from '../PipControlBar'

type PipOptionsMenuItemsProps = {
  overflowControls?: Set<CollapsibleControl>
}

export const PipOptionsMenuItems = ({
  overflowControls,
}: PipOptionsMenuItemsProps) => {
  const { t } = useTranslation('rooms')
  const hasOverflow = overflowControls && overflowControls.size > 0

  return (
    <RACMenu
      style={{
        minWidth: '150px',
        width: '300px',
      }}
    >
      {hasOverflow && (
        <>
          <MenuSection>
            <OverflowItems overflowControls={overflowControls} t={t} />
          </MenuSection>
          <Separator />
        </>
      )}
      <MenuSection>
        <PictureInPictureMenuItem />
        <EffectsMenuItem store={pipLayoutStore} />
      </MenuSection>
      <Separator />
      <MenuSection>
        <SupportMenuItem />
        <FeedbackMenuItem />
        <SettingsMenuItem />
      </MenuSection>
    </RACMenu>
  )
}

const OverflowItems = ({
  overflowControls,
  t,
}: {
  overflowControls: Set<CollapsibleControl>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) => {
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
