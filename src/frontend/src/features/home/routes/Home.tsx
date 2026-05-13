import { useTranslation } from 'react-i18next'
import {
  DialogTrigger,
  MenuItem,
  Menu as RACMenu,
  Separator as RACSeparator,
} from 'react-aria-components'
import { Button, Menu } from '@/primitives'
import { styled } from '@/styled-system/jsx'
import { navigateTo } from '@/navigation/navigateTo'
import { Screen } from '@/layout/Screen'
import { generateRoomId, useCreateRoom } from '@/features/rooms'
import { useUser, UserAware } from '@/features/auth'
import { JoinMeetingDialog } from '../components/JoinMeetingDialog'
import { RiAddLine, RiLink, RiShieldCrossLine } from '@remixicon/react'
import { LaterMeetingDialog } from '@/features/home/components/LaterMeetingDialog'
import { CreateEncryptedMeetingDialog } from '@/features/home/components/CreateEncryptedMeetingDialog'
import { ConnectionDetailsDialog } from '@/features/home/components/ConnectionDetailsDialog'
import { generatePassphrase } from '@/features/encryption'
import { ApiEncryptionMode } from '@/features/rooms/api/ApiRoom'
import { IntroSlider } from '@/features/home/components/IntroSlider'
import { MoreLink } from '@/features/home/components/MoreLink'
import { ReactNode, useEffect, useState } from 'react'

import { css } from '@/styled-system/css'
import { menuRecipe } from '@/primitives/menuRecipe.ts'
import { usePersistentUserChoices } from '@/features/rooms/livekit/hooks/usePersistentUserChoices'
import { useConfig } from '@/api/useConfig'
import { LoginButton } from '@/components/LoginButton'
import { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { LoadingScreen } from '@/components/LoadingScreen'

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
          flexBasis: '40rem',
          maxWidth: '40rem',
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
    borderColor: 'greyscale.500',
    marginTop: '2.5rem',
    maxWidth: '30rem',
    width: '100%',
  },
})

const Heading = styled('h1', {
  base: {
    fontWeight: '700',
    fontStyle: 'normal',
    fontStretch: 'normal',
    fontOpticalSizing: 'auto',
    paddingBottom: '1.2rem',
    fontSize: '2.3rem',
    lineHeight: '2.6rem',
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
    fontSize: '1.2rem',
    lineHeight: '1.5rem',
    textWrap: 'balance',
    maxWidth: '32rem',
  },
})

export const Home = () => {
  const { t } = useTranslation('home')
  const { isLoggedIn, user } = useUser()

  const {
    userChoices: { username },
  } = usePersistentUserChoices()

  const { mutateAsync: createRoom } = useCreateRoom()
  const [laterRoom, setLaterRoom] = useState<null | { room: ApiRoom }>(null)
  const [encryptedRoom, setEncryptedRoom] = useState<null | {
    room: ApiRoom
    hash: string
  }>(null)
  const [showEncryptedConfirm, setShowEncryptedConfirm] = useState(false)
  const [redirectFailed, setRedirectFailed] = useState(false)

  const { data } = useConfig()
  // The encrypted dropdown entry is offered only when:
  //   - the server has encryption enabled (instance config), AND
  //   - the user opted into the feature in their preferences.
  // "Instant meeting" and "Later date" stay plain regardless — encryption
  // is always an explicit, opt-in flow with its own confirmation modal.
  const encryptionAvailable =
    !!data?.encryption?.enabled &&
    user?.default_encryption_mode === ApiEncryptionMode.BASIC

  const buildRoomBundle = async (
    encryptionMode: ApiEncryptionMode = ApiEncryptionMode.NONE
  ) => {
    const slug = generateRoomId()
    const hash =
      encryptionMode === ApiEncryptionMode.BASIC
        ? generatePassphrase()
        : undefined
    const room = await createRoom({ slug, username, encryptionMode })
    return { room, hash }
  }

  useEffect(() => {
    const checkSiteAndRedirect = async () => {
      if (!data?.external_home_url) return
      if (isLoggedIn === false) {
        try {
          await fetch(data.external_home_url, {
            method: 'HEAD', // Use HEAD to avoid downloading the full page
            mode: 'no-cors', // Needed for cross-origin requests
          })
          window.location.replace(data.external_home_url)
        } catch (error) {
          setRedirectFailed(true)
          console.error('Site is not reachable:', error)
        }
      }
    }

    checkSiteAndRedirect()
  }, [isLoggedIn, data])

  if (data?.external_home_url && isLoggedIn == false && !redirectFailed) {
    return <LoadingScreen header={false} footer={false} delay={0} />
  }

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
                        const { room } = await buildRoomBundle()
                        navigateTo('room', room.slug, {
                          state: { create: true, initialRoomData: room },
                        })
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
                      onAction={async () => {
                        const { room } = await buildRoomBundle()
                        setLaterRoom({ room })
                      }}
                      data-attr="create-option-later"
                    >
                      <RiLink size={18} />
                      {t('createMenu.laterOption')}
                    </MenuItem>
                    {encryptionAvailable && (
                      <>
                        <RACSeparator
                          className={css({
                            border: 'none',
                            height: '1px',
                            background: 'greyscale.250',
                            margin: '0.35rem 0',
                          })}
                        />
                        <MenuItem
                          className={
                            menuRecipe({ icon: true, variant: 'light' }).item
                          }
                          onAction={() => setShowEncryptedConfirm(true)}
                          data-attr="create-option-encrypted"
                        >
                          <RiShieldCrossLine size={18} />
                          {t('createMenu.encryptedOption')}
                        </MenuItem>
                      </>
                    )}
                  </RACMenu>
                </Menu>
              ) : (
                <LoginButton proConnectHint={false} />
              )}
              <DialogTrigger>
                <Button
                  variant="secondary"
                  style={{
                    height:
                      !isLoggedIn && data?.use_proconnect_button
                        ? '56px'
                        : undefined, // Temporary, Align with ProConnect Button fixed height
                  }}
                >
                  {t('joinMeeting')}
                </Button>
                <JoinMeetingDialog />
              </DialogTrigger>
            </div>
            <Separator />
            <MoreLink />
          </LeftColumn>
          <RightColumn>
            <IntroSlider />
          </RightColumn>
        </Columns>
        <LaterMeetingDialog
          room={laterRoom?.room ?? null}
          onOpenChange={() => setLaterRoom(null)}
        />
        <CreateEncryptedMeetingDialog
          isOpen={showEncryptedConfirm}
          onOpenChange={setShowEncryptedConfirm}
          onConfirm={async () => {
            setShowEncryptedConfirm(false)
            const { room, hash } = await buildRoomBundle(
              ApiEncryptionMode.BASIC
            )
            if (hash) setEncryptedRoom({ room, hash })
          }}
        />
        <ConnectionDetailsDialog
          room={encryptedRoom?.room ?? null}
          hash={encryptedRoom?.hash ?? ''}
          onOpenChange={(open) => {
            if (!open) setEncryptedRoom(null)
          }}
          onStart={() => {
            if (!encryptedRoom) return
            const { room, hash } = encryptedRoom
            setEncryptedRoom(null)
            navigateTo('room', room.slug, {
              state: { create: true, initialRoomData: room },
              hash,
            })
          }}
        />
      </Screen>
    </UserAware>
  )
}
