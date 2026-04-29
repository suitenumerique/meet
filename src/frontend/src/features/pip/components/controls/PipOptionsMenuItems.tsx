import { Menu as RACMenu, MenuSection } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { Separator } from '@/primitives/Separator'
import { FeedbackMenuItem } from '@/features/rooms/livekit/components/controls/Options/FeedbackMenuItem'
import { EffectsMenuItem } from '@/features/rooms/livekit/components/controls/Options/EffectsMenuItem'
import { SupportMenuItem } from '@/features/rooms/livekit/components/controls/Options/SupportMenuItem'
import { PictureInPictureMenuItem } from '@/features/rooms/livekit/components/controls/Options/PictureInPictureMenuItem'
import { pipLayoutStore } from '@/features/pip/stores/pipLayoutStore'
import { PipOverflowItems } from './PipOverflowItems'
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
            <PipOverflowItems overflowControls={overflowControls} t={t} />
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
      </MenuSection>
    </RACMenu>
  )
}
