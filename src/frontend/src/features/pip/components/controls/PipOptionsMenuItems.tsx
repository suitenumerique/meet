import { Menu as RACMenu, MenuSection } from 'react-aria-components'
import { Separator } from '@/primitives/Separator'
import { FeedbackMenuItem } from '@/features/rooms/livekit/components/controls/Options/FeedbackMenuItem'
import { EffectsMenuItem } from '@/features/rooms/livekit/components/controls/Options/EffectsMenuItem'
import { SupportMenuItem } from '@/features/rooms/livekit/components/controls/Options/SupportMenuItem'
import { PictureInPictureMenuItem } from '@/features/rooms/livekit/components/controls/Options/PictureInPictureMenuItem'
import { PipOverflowItems } from './PipOverflowItems'
import type { CollapsibleControl } from '../PipControlBar'

type PipOptionsMenuItemsProps = {
  overflowControls?: Set<CollapsibleControl>
}

export const PipOptionsMenuItems = ({
  overflowControls,
}: PipOptionsMenuItemsProps) => {
  const hasOverflow = (overflowControls?.size ?? 0) > 0

  const hasOverflowControls = hasOverflow && overflowControls

  return (
    <RACMenu
      style={{
        minWidth: '150px',
        width: '300px',
      }}
    >
      {hasOverflowControls && (
        <>
          <MenuSection>
            <PipOverflowItems overflowControls={overflowControls} />
          </MenuSection>
          <Separator />
        </>
      )}
      <MenuSection>
        <PictureInPictureMenuItem />
        <EffectsMenuItem />
      </MenuSection>
      <Separator />
      <MenuSection>
        <SupportMenuItem />
        <FeedbackMenuItem />
      </MenuSection>
    </RACMenu>
  )
}
