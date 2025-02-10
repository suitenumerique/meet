import { useTranslation } from 'react-i18next'
import { DialogTrigger, MenuItem, Menu as RACMenu } from 'react-aria-components'
import { Button, Menu } from '@/primitives'
import { styled } from '@/styled-system/jsx'
import { navigateTo } from '@/navigation/navigateTo'
import { Screen } from '@/layout/Screen'
import { generateRoomId } from '@/features/rooms'
import { useUser, UserAware } from '@/features/auth'
import { JoinMeetingDialog } from '../components/JoinMeetingDialog'
import { ProConnectButton } from '@/components/ProConnectButton'
import { useCreateRoom } from '@/features/rooms'
import { RiAddLine, RiLink } from '@remixicon/react'
import { LaterMeetingDialog } from '@/features/home/components/LaterMeetingDialog'
import { IntroSlider } from '@/features/home/components/IntroSlider'
import { MoreLink } from '@/features/home/components/MoreLink'
import { ReactNode, useEffect, useState } from 'react'

import { css } from '@/styled-system/css'
import { menuRecipe } from '@/primitives/menuRecipe.ts'
import { usePersistentUserChoices } from '@/features/rooms/livekit/hooks/usePersistentUserChoices'
import { SdkReverseClient } from '@/features/sdk/SdkReverseClient'

const Columns = ({ children }: { children?: ReactNode }) => {
  return (
    <div
      className={css({
        alignItems: 'center',
        margin: 'auto',
        display: 'inline-flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '100%',
        justifyContent: 'normal',
        padding: '0 1rem',
        width: 'calc(100% - 2rem)',
        _motionReduce: {
          opacity: 1,
        },
        _motionSafe: {
          opacity: 0,
          animation: '.5s ease-in fade 0s forwards',
        },
        lg: {
          flexDirection: 'row',
          justifyContent: 'center',
          width: '100%',
          padding: 0,
        },
      })}
    >
      {children}
    </div>
  )
}

const LeftColumn = ({ children }: { children?: ReactNode }) => {
  return (
    <div
      className={css({
        alignItems: 'center',
        textAlign: 'center',
        display: 'inline-flex',
        flexDirection: 'column',
        flexBasis: 'auto',
        flexShrink: 0,
        maxWidth: '38rem',
        width: '100%',
        padding: '1rem 3%',
        marginTop: 'auto',
        lg: {
          margin: 0,
          textAlign: 'left',
          alignItems: 'flex-start',
          flexShrink: '1',
          flexBasis: '36rem',
          maxWidth: '36rem',
          padding: '1em 3em',
        },
      })}
    >
      {children}
    </div>
  )
}

const RightColumn = ({ children }: { children?: ReactNode }) => {
  return (
    <div
      className={css({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'hidden',
        padding: '1rem 3%',
        marginBottom: 'auto',
        flexBasis: 'auto',
        flexShrink: 0,
        maxWidth: '39rem',
        lg: {
          margin: 0,
          flexBasis: '45%',
          padding: '1em 3em',
        },
      })}
    >
      {children}
    </div>
  )
}

const Separator = styled('div', {
  base: {
    borderBottom: '1px solid',
    borderColor: '#747775',
    marginTop: '2.5rem',
    maxWidth: '30rem',
    width: '100%',
  },
})

const Heading = styled('h1', {
  base: {
    fontWeight: '500',
    fontStyle: 'normal',
    fontStretch: 'normal',
    fontOpticalSizing: 'auto',
    marginBottom: 0,
    paddingBottom: '0.75rem',
    fontSize: '2.3rem',
    lineHeight: '2.5rem',
    letterSpacing: '0',
    xsm: {
      fontSize: '3rem',
      lineHeight: '3.2rem',
    },
  },
})

const IntroText = styled('div', {
  base: {
    marginBottom: '3rem',
    fontSize: '1.5rem',
    lineHeight: '1.8rem',
    textWrap: 'pretty',
    maxWidth: '32rem',
  },
})

export const Home = () => {
  const { t } = useTranslation('home')
  const { isLoggedIn } = useUser()

  const {
    userChoices: { username },
  } = usePersistentUserChoices()

  const { mutateAsync: createRoom } = useCreateRoom()
  const [laterRoomId, setLaterRoomId] = useState<null | string>(null)

  const { user } = useUser()

  /**
   * Used for SDK popup to close automatically.
   */
  useEffect(() => {
    if (!user) {
      return
    }
    SdkReverseClient.broadcastAuthentication()
  }, [user])

  return (
    <UserAware>
      <Screen>
        <Columns>
          <LeftColumn>
            <Heading>{t('heading')}</Heading>
            <IntroText>{t('intro')}</IntroText>
            <div
              className={css({
                display: 'flex',
                gap: 0.5,
                flexDirection: { base: 'column', xsm: 'row' },
                alignItems: { base: 'center', xsm: 'items-start' },
              })}
            >
              {isLoggedIn ? (
                <Menu>
                  <Button variant="primary" data-attr="create-meeting">
                    {t('createMeeting')}
                  </Button>
                  <RACMenu>
                    <MenuItem
                      className={
                        menuRecipe({ icon: true, variant: 'light' }).item
                      }
                      onAction={async () => {
                        const slug = generateRoomId()
                        createRoom({ slug, username }).then((data) =>
                          navigateTo('room', data.slug, {
                            state: { create: true, initialRoomData: data },
                          })
                        )
                      }}
                      data-attr="create-option-instant"
                    >
                      <RiAddLine size={18} />
                      {t('createMenu.instantOption')}
                    </MenuItem>
                    <MenuItem
                      className={
                        menuRecipe({ icon: true, variant: 'light' }).item
                      }
                      onAction={() => {
                        const slug = generateRoomId()
                        createRoom({ slug, username }).then((data) =>
                          setLaterRoomId(data.slug)
                        )
                      }}
                      data-attr="create-option-later"
                    >
                      <RiLink size={18} />
                      {t('createMenu.laterOption')}
                    </MenuItem>
                  </RACMenu>
                </Menu>
              ) : (
                <ProConnectButton hint={false} />
              )}
              <DialogTrigger>
                <Button
                  variant="secondary"
                  style={{
                    height: !isLoggedIn ? '56px' : undefined, // Temporary, Align with ProConnect Button fixed height
                  }}
                >
                  {t('joinMeeting')}
                </Button>
                <JoinMeetingDialog />
              </DialogTrigger>
            </div>
            <Separator />
            <div
              className={css({
                display: { base: 'none', lg: 'inline' },
              })}
            >
              <MoreLink />
            </div>
          </LeftColumn>
          <RightColumn>
            <IntroSlider />
            <div
              className={css({
                display: { base: 'inline', lg: 'none' },
              })}
            >
              <MoreLink />
            </div>
          </RightColumn>
        </Columns>
        <LaterMeetingDialog
          roomId={laterRoomId || ''}
          onOpenChange={() => setLaterRoomId(null)}
        />
      </Screen>
    </UserAware>
  )
}
