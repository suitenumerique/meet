/**
 * Shown when the URL hash and the room's encryption_mode disagree.
 *
 *  - missingPassphrase: room is encrypted on the server, but the URL has no
 *    (or an invalid) passphrase. The user opened the wrong link.
 *  - unexpectedPassphrase: the URL has a passphrase, but the server says the
 *    room is not encrypted. Either the room was created differently or the
 *    link looks tampered with — either way, joining as "encrypted" would
 *    leave the user alone in an encrypted bubble. Better to bail.
 */
import { css } from '@/styled-system/css'
import { Center } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { RiAlertLine, RiLockUnlockLine } from '@remixicon/react'
import { Button, Text } from '@/primitives'
import { Screen } from '@/layout/Screen'
import { CenteredContent } from '@/layout/CenteredContent'
import { navigateTo } from '@/navigation/navigateTo'

interface Props {
  reason: 'missingPassphrase' | 'unexpectedPassphrase'
}

export function EncryptionMismatchScreen({ reason }: Props) {
  const { t } = useTranslation('rooms', { keyPrefix: 'encryption.mismatch' })

  return (
    <Screen layout="centered">
      <CenteredContent>
        <Center>
          <div
            className={css({
              maxWidth: '420px',
              padding: '2rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              textAlign: 'center',
            })}
          >
            <div
              className={css({
                width: '3.5rem',
                height: '3.5rem',
                borderRadius: '50%',
                backgroundColor: '#fffbeb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              {reason === 'missingPassphrase' ? (
                <RiLockUnlockLine size={28} color="#b45309" />
              ) : (
                <RiAlertLine size={28} color="#b45309" />
              )}
            </div>
            <Text
              as="h2"
              className={css({ fontWeight: 700, fontSize: '1.15rem' })}
            >
              {t(`${reason}.title`)}
            </Text>
            <Text
              as="p"
              className={css({ fontSize: '0.9rem', color: 'greyscale.700' })}
            >
              {t(`${reason}.body`)}
            </Text>
            <Button variant="primary" onPress={() => navigateTo('home')}>
              {t('backHome')}
            </Button>
          </div>
        </Center>
      </CenteredContent>
    </Screen>
  )
}
