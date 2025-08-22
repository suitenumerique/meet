import { Dialog, type DialogProps } from '@/primitives'
import { Tab, Tabs, TabList } from '@/primitives/Tabs.tsx'
import { css } from '@/styled-system/css'
import { text } from '@/primitives/Text.tsx'
import { Heading } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import {
  RiAccountCircleLine,
  RiNotification3Line,
  RiSettings3Line,
  RiSpeakerLine,
  RiVideoOnLine,
} from '@remixicon/react'
import { AccountTab } from './tabs/AccountTab'
import { NotificationsTab } from './tabs/NotificationsTab'
import { GeneralTab } from './tabs/GeneralTab'
import { AudioTab } from './tabs/AudioTab'
import { VideoTab } from './tabs/VideoTab'
import { useRef } from 'react'
import { useMediaQuery } from '@/features/rooms/livekit/hooks/useMediaQuery'
import { SettingsDialogExtendedKey } from '@/features/settings/type'

const tabsStyle = css({
  maxHeight: '40.625rem', // fixme size copied from meet settings modal
  width: '50rem', // fixme size copied from meet settings modal
  marginY: '-1rem', // fixme hacky solution to cancel modal padding
  maxWidth: '100%',
  overflow: 'hidden',
  height: 'calc(100vh - 2rem)',
})

const tabListContainerStyle = css({
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid lightGray', // fixme poor color management
  paddingY: '1rem',
  paddingRight: '1.5rem',
})

const tabPanelContainerStyle = css({
  display: 'flex',
  flexGrow: '1',
  marginTop: '3.5rem',
  minWidth: 0,
})

export type SettingsDialogExtended = Pick<
  DialogProps,
  'isOpen' | 'onOpenChange'
> & {
  defaultSelectedKey?: SettingsDialogExtendedKey
}

export const SettingsDialogExtended = (props: SettingsDialogExtended) => {
  // display only icon on small screen
  const { t } = useTranslation('settings')

  const dialogEl = useRef<HTMLDivElement>(null)
  const isWideScreen = useMediaQuery('(min-width: 800px)') // fixme - hardcoded 50rem in pixel

  return (
    <Dialog innerRef={dialogEl} {...props} role="dialog" type="flex">
      <Tabs
        orientation="vertical"
        className={tabsStyle}
        defaultSelectedKey={props.defaultSelectedKey}
      >
        <div
          className={tabListContainerStyle}
          style={{
            flex: isWideScreen ? '0 0 16rem' : undefined,
            paddingTop: !isWideScreen ? '64px' : undefined,
            paddingRight: !isWideScreen ? '1rem' : undefined,
          }}
        >
          {isWideScreen && (
            <Heading slot="title" level={1} className={text({ variant: 'h1' })}>
              {t('dialog.heading')}
            </Heading>
          )}
          <TabList border={false}>
            <Tab icon highlight id={SettingsDialogExtendedKey.ACCOUNT}>
              <RiAccountCircleLine />
              {isWideScreen && t(`tabs.${SettingsDialogExtendedKey.ACCOUNT}`)}
            </Tab>
            <Tab icon highlight id={SettingsDialogExtendedKey.AUDIO}>
              <RiSpeakerLine />
              {isWideScreen && t(`tabs.${SettingsDialogExtendedKey.AUDIO}`)}
            </Tab>
            <Tab icon highlight id={SettingsDialogExtendedKey.VIDEO}>
              <RiVideoOnLine />
              {isWideScreen && t(`tabs.${SettingsDialogExtendedKey.VIDEO}`)}
            </Tab>
            <Tab icon highlight id={SettingsDialogExtendedKey.GENERAL}>
              <RiSettings3Line />
              {isWideScreen && t(`tabs.${SettingsDialogExtendedKey.GENERAL}`)}
            </Tab>
            <Tab icon highlight id={SettingsDialogExtendedKey.NOTIFICATIONS}>
              <RiNotification3Line />
              {isWideScreen &&
                t(`tabs.${SettingsDialogExtendedKey.NOTIFICATIONS}`)}
            </Tab>
          </TabList>
        </div>
        <div className={tabPanelContainerStyle}>
          <AccountTab
            id={SettingsDialogExtendedKey.ACCOUNT}
            onOpenChange={props.onOpenChange}
          />
          <AudioTab id={SettingsDialogExtendedKey.AUDIO} />
          <VideoTab id={SettingsDialogExtendedKey.VIDEO} />
          <GeneralTab id={SettingsDialogExtendedKey.GENERAL} />
          <NotificationsTab id={SettingsDialogExtendedKey.NOTIFICATIONS} />
        </div>
      </Tabs>
    </Dialog>
  )
}
