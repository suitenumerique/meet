import { Menu as RACMenu, MenuSection } from 'react-aria-components'
import { Separator } from '@/primitives/Separator'
import { SettingsMenuItem } from '@/features/rooms/livekit/components/controls/Options/SettingsMenuItem'
import { FeedbackMenuItem } from '@/features/rooms/livekit/components/controls/Options/FeedbackMenuItem'
import { EffectsMenuItem } from '@/features/rooms/livekit/components/controls/Options/EffectsMenuItem'
import { SupportMenuItem } from '@/features/rooms/livekit/components/controls/Options/SupportMenuItem'
import { PictureInPictureMenuItem } from '@/features/rooms/livekit/components/controls/Options/PictureInPictureMenuItem'
import { pipLayoutStore } from '@/features/pip/stores/pipLayoutStore'

/**
 * PiP options menu items: excludes transcript, screen recording, and full screen
 * (those features are not relevant in the PiP window context).
 */
export const PipOptionsMenuItems = () => (
  <RACMenu
    style={{
      minWidth: '150px',
      width: '300px',
    }}
  >
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
