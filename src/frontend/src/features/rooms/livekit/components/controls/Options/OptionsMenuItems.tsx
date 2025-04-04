import { Menu as RACMenu, MenuSection } from 'react-aria-components'
import { Separator } from '@/primitives/Separator'
import { FullScreenMenuItem } from './FullScreenMenuItem'
import { SettingsMenuItem } from './SettingsMenuItem'
import { FeedbackMenuItem } from './FeedbackMenuItem'
import { EffectsMenuItem } from './EffectsMenuItem'
import { SupportMenuItem } from './SupportMenuItem'

// @todo try refactoring it to use MenuList component
export const OptionsMenuItems = () => {
  return (
    <RACMenu
      style={{
        minWidth: '150px',
        width: '300px',
      }}
    >
      <MenuSection>
        <FullScreenMenuItem />
        <EffectsMenuItem />
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
