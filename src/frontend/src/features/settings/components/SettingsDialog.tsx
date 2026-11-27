import { Trans, useTranslation } from 'react-i18next'
import { useRef } from 'react'
import { Heading } from 'react-aria-components'
import { RiDoorOpenLine } from '@remixicon/react'
import { useLanguageLabels } from '@/i18n/useLanguageLabels'
import {
  A,
  Badge,
  Dialog,
  type DialogProps,
  Field,
  H,
  P,
  Icon,
} from '@/primitives'
import { Tab, TabList, TabPanel, Tabs } from '@/primitives/Tabs'
import { scrollbar } from '@/primitives/scrollbar'
import { css, cx } from '@/styled-system/css'
import { useUser } from '@/features/auth/api/useUser'
import { LoginButton } from '@/components/LoginButton'
import { logout } from '@/features/auth/utils/logout'
import { useMediaQuery } from '@/features/rooms/livekit/hooks/useMediaQuery'
import { RoomsTab } from './tabs/RoomsTab'
import {
  contentStyle,
  sidebarStyle,
  SIDEBAR_WIDTH,
  tabsStyle,
} from './settingsDialogLayout'
import { SelectedTabTitle } from './SelectedTabTitle'

export type SettingsDialogProps = Pick<DialogProps, 'isOpen' | 'onOpenChange'>

enum SettingsDialogTabKey {
  GENERAL = 'general',
  ROOMS = 'rooms',
}

const tabPanelStyle = css({
  flexGrow: '1',
  minWidth: 0,
  overflowY: 'auto',
})

export const SettingsDialog = (props: SettingsDialogProps) => {
  const { t, i18n } = useTranslation('settings')
  const { user, isLoggedIn } = useUser()
  const { languagesList, currentLanguage } = useLanguageLabels()

  const dialogEl = useRef<HTMLDivElement>(null)
  const isWideScreen = useMediaQuery('(min-width: 800px)') // fixme - hardcoded 50rem in pixel

  const userDisplay =
    user?.full_name && user?.email
      ? `${user.full_name} (${user.email})`
      : user?.email

  const generalContent = (
    <div
      className={css({
        display: 'flex',
        flexDirection: 'column',
        minWidth: '360px',
      })}
    >
      <H lvl={2}>{t('account.heading')}</H>
      {isLoggedIn ? (
        <>
          <P>
            <Trans
              i18nKey="settings:account.currentlyLoggedAs"
              values={{ user: userDisplay }}
              components={[<Badge key="user-badge" />]}
            />
          </P>
          <P>
            <A onPress={logout}>{t('logout', { ns: 'global' })}</A>
          </P>
        </>
      ) : (
        <>
          <P>{t('account.youAreNotLoggedIn')}</P>
          <LoginButton />
        </>
      )}
      <H lvl={2}>{t('language.heading')}</H>
      <Field
        type="select"
        label={t('language.label')}
        items={languagesList}
        defaultSelectedKey={currentLanguage.key}
        onSelectionChange={(lang) => {
          i18n.changeLanguage(lang as string)
        }}
      />
    </div>
  )

  // Without tabs there is no rail to host the heading, so keep the plain dialog.
  if (!isLoggedIn) {
    return (
      <Dialog title={t('dialog.heading')} {...props} role="dialog" type="flex">
        {generalContent}
      </Dialog>
    )
  }

  return (
    <Dialog innerRef={dialogEl} {...props} role="dialog" type="flex">
      <Tabs
        orientation="vertical"
        className={tabsStyle}
        defaultSelectedKey={SettingsDialogTabKey.GENERAL}
      >
        <div
          className={sidebarStyle}
          style={{
            flex: isWideScreen ? `0 0 ${SIDEBAR_WIDTH}` : undefined,
          }}
        >
          {isWideScreen && (
            <Heading slot="title" level={1}>
              {t('dialog.heading')}
            </Heading>
          )}
          <TabList border={false}>
            <Tab icon highlight id={SettingsDialogTabKey.GENERAL}>
              <Icon name="gear-rounded" />
              {isWideScreen && t(`tabs.${SettingsDialogTabKey.GENERAL}`)}
            </Tab>
            <Tab icon highlight id={SettingsDialogTabKey.ROOMS}>
              <RiDoorOpenLine />
              {isWideScreen && t(`tabs.${SettingsDialogTabKey.ROOMS}`)}
            </Tab>
          </TabList>
        </div>
        <div className={contentStyle}>
          <SelectedTabTitle />
          <TabPanel
            id={SettingsDialogTabKey.GENERAL}
            className={cx(scrollbar, tabPanelStyle)}
          >
            {generalContent}
          </TabPanel>
          <RoomsTab id={SettingsDialogTabKey.ROOMS} />
        </div>
      </Tabs>
    </Dialog>
  )
}
