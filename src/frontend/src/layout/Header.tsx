import { Link } from 'wouter'
import { css } from '@/styled-system/css'
import { HStack, Stack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@/primitives'
import { SettingsButton } from '@/features/settings'
import { useUser } from '@/features/auth'
import { useMatchesRoute } from '@/navigation/useMatchesRoute'
import { FeedbackBanner } from '@/components/FeedbackBanner'
import { Menu } from '@/primitives/Menu'
import { MenuList } from '@/primitives/MenuList'
import { ProConnectButton } from '@/components/ProConnectButton'

import LogoAsset from '@/assets/logo.svg'
import { useLoginHint } from '@/hooks/useLoginHint'

const Marianne = () => {
  return (
    <div
      className={css({
        _before: {
          content: '""',
          display: 'block',
          backgroundImage: 'url(/assets/marianne.svg)',
          backgroundPosition: '0 -0.046875rem, 0 0, 0 0',
          backgroundSize: '2.0625rem 0.84375rem, 2.0625rem 0.75rem, 0',
          height: '0.75rem',
          marginBottom: '0.1rem',
          width: '2.0625rem',
        },
        _after: {
          content: '""',
          display: 'block',
          backgroundImage: 'url(/assets/devise.svg)',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'contain',
          width: '2.5rem',
          height: '1.7857142857142858rem',
          marginTop: '0.25rem',
        },
      })}
    >
      <p
        className={css({
          letterSpacing: '-.01em',
          textTransform: 'uppercase',
          fontWeight: '600',
          fontFamily: 'Marianne',
          fontSize: '0.7875rem !important',
        })}
      >
        gouvernement
      </p>
    </div>
  )
}

const BetaBadge = () => (
  <span
    className={css({
      content: '"Beta"',
      display: 'block',
      letterSpacing: '-0.02rem',
      padding: '0 0.25rem',
      backgroundColor: '#E8EDFF',
      color: '#0063CB',
      fontSize: '12px',
      fontWeight: 500,
      margin: '0 0 0.9375rem 0.3125rem',
      lineHeight: '1rem',
      borderRadius: '4px',
      width: 'fit-content',
      height: 'fit-content',
      marginTop: { base: '10px', sm: '5px' },
    })}
  >
    Beta
  </span>
)

const Logo = () => {
  const { t } = useTranslation()
  return (
    <img
      src={LogoAsset}
      alt={t('app')}
      className={css({
        maxHeight: { base: '30px', sm: '40px' },
        marginTop: { base: '10px', sm: '5px' },
      })}
    />
  )
}

const LoginHint = () => {
  const { t } = useTranslation()
  const { isVisible, closeLoginHint } = useLoginHint()
  if (!isVisible) return null
  return (
    <div
      className={css({
        position: 'absolute',
        top: '103px',
        right: '110px',
        zIndex: '100',
        outline: 'none',
        padding: '1.25rem',
        maxWidth: '350px',
        boxShadow: '0 2px 5px rgba(0 0 0 / 0.1)',
        borderRadius: '1rem',
        backgroundColor: 'primary.200',
        display: 'none',
        xsm: {
          display: 'block',
        },
        sm: {
          top: '131px',
          right: '100px',
          zIndex: '100',
        },
        _after: {
          content: '""',
          position: 'absolute',
          top: '-10px',
          right: '20%',
          marginLeft: '-10px',
          borderWidth: '0 10px 10px 10px',
          borderStyle: 'solid',
          borderColor: 'transparent transparent #E3E3FB transparent',
        },
      })}
    >
      <Text variant="h3" margin={false} bold>
        {t('loginHint.title')}
      </Text>
      <Text variant="paragraph" margin={false}>
        {t('loginHint.body')}
      </Text>
      <Button
        aria-label={t('loginHint.button.ariaLabel')}
        size="sm"
        className={css({
          marginLeft: 'auto',
        })}
        onPress={() => closeLoginHint()}
      >
        {t('loginHint.button.label')}
      </Button>
    </div>
  )
}

export const Header = () => {
  const { t } = useTranslation()
  const isHome = useMatchesRoute('home')
  const isRoom = useMatchesRoute('room')
  const { user, isLoggedIn, logout } = useUser()

  return (
    <>
      <FeedbackBanner />
      <div
        className={css({
          paddingBottom: 1,
          paddingX: 1,
          paddingTop: 0.25,
          flexShrink: 0,
        })}
      >
        <HStack gap={0} justify="space-between" alignItems="center">
          <header>
            <Stack gap={2.25} direction="row" align="center">
              <Link
                className={css({
                  display: 'flex',
                  flexDirection: { base: 'column', sm: 'row' },
                  alignItems: 'start',
                  gap: { base: '0', sm: '2rem' },
                  padding: { base: '0.5rem', sm: '1rem' },
                  _hover: {
                    backgroundColor: 'greyscale.100',
                    borderRadius: '4px',
                  },
                })}
                onClick={(event) => {
                  if (
                    isRoom &&
                    !window.confirm(t('leaveRoomPrompt', { ns: 'rooms' }))
                  ) {
                    event.preventDefault()
                  }
                }}
                to="/"
              >
                <Marianne />
                <HStack gap={0}>
                  <Logo />
                  <BetaBadge />
                </HStack>
              </Link>
            </Stack>
          </header>
          <nav>
            <Stack gap={1} direction="row" align="center">
              {isLoggedIn === false && !isHome && (
                <>
                  <ProConnectButton hint={false} />
                  <LoginHint />
                </>
              )}
              {!!user && (
                <Menu>
                  <Button
                    size="sm"
                    variant="secondaryText"
                    tooltip={t('loggedInUserTooltip')}
                    tooltipType="delayed"
                  >
                    <span
                      className={css({
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '350px',
                        display: { base: 'none', xsm: 'block' },
                      })}
                    >
                      {user?.full_name || user?.email}
                    </span>
                  </Button>
                  <MenuList
                    variant={'light'}
                    items={[{ value: 'logout', label: t('logout') }]}
                    onAction={(value) => {
                      if (value === 'logout') {
                        logout()
                      }
                    }}
                  />
                </Menu>
              )}
              <SettingsButton />
            </Stack>
          </nav>
        </HStack>
      </div>
    </>
  )
}
