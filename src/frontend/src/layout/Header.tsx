import { Link } from 'wouter'
import { css } from '@/styled-system/css'
import { HStack, Stack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@/primitives'
import { SettingsButton } from '@/features/settings'
import { useUser } from '@/features/auth'
import { useMatchesRoute } from '@/navigation/useMatchesRoute'
import { Menu } from '@/primitives/Menu'
import { MenuList } from '@/primitives/MenuList'
import { LoginButton } from '@/components/LoginButton'
import { VisualOnlyTooltip } from '@/primitives/VisualOnlyTooltip'

import { useLoginHint } from '@/hooks/useLoginHint'
import { IncidentBanner } from '@/components/IncidentBanner'

const Logo = () => (
  <img
    src="/assets/logo.svg"
    alt={`${import.meta.env.VITE_APP_TITLE}`}
    className={`Header-logo ${css({
      maxHeight: { base: '30px', sm: '40px' },
      marginTop: { base: '10px', sm: '5px' },
    })}`}
  />
)

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
  const isLegalTerms = useMatchesRoute('legalTerms')
  const isAccessibility = useMatchesRoute('accessibility')
  const isTermsOfService = useMatchesRoute('termsOfService')
  const isRoom = useMatchesRoute('room')
  const { user, isLoggedIn, logout } = useUser()
  const userLabel = user?.full_name || user?.email
  const loggedInTooltip = t('loggedInUserTooltip')
  const loggedInAriaLabel = userLabel
    ? `${loggedInTooltip} ${userLabel}`
    : loggedInTooltip

  return (
    <>
      {/*<FeedbackBanner />*/}
      <IncidentBanner />
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
                {/* this is there only as a hook for custom CSS users who might want to show something before the app logo */}
                <div
                  className={`Header-beforeLogo ${css({
                    display: 'none',
                  })}`}
                />
                <HStack gap={0}>
                  <Logo />
                </HStack>
              </Link>
            </Stack>
          </header>
          <nav>
            <Stack gap={1} direction="row" align="center">
              {isLoggedIn === false &&
                !isHome &&
                !isLegalTerms &&
                !isAccessibility &&
                !isTermsOfService && (
                  <>
                    <LoginButton proConnectHint={false} />
                    <LoginHint />
                  </>
                )}
              {!!user && (
                <Menu>
                  <Button size="sm" variant="secondaryText">
                    <VisualOnlyTooltip
                      tooltip={loggedInTooltip}
                      ariaLabel={loggedInAriaLabel}
                      tooltipPosition="bottom"
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
                    </VisualOnlyTooltip>
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
