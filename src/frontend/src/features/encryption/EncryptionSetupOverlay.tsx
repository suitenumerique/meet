/**
 * Overlay shown during encryption key exchange.
 *
 * When a participant joins an encrypted room, there's a brief period
 * between connection and receiving the symmetric key where media
 * cannot be decrypted. This overlay provides feedback during that time.
 *
 * After 20 seconds without the key, shows an error with a refresh button.
 */
import { css } from '@/styled-system/css'
import { VStack } from '@/styled-system/jsx'
import { Text, Button } from '@/primitives'
import { Spinner } from '@/primitives/Spinner'
import { RiLockFill, RiAlertFill, RiRefreshLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'

const KEY_EXCHANGE_TIMEOUT = 20000

export function EncryptionSetupOverlay({
  isSettingUp,
  error,
}: {
  isSettingUp: boolean
  error: string | null
}) {
  const { t } = useTranslation('rooms', { keyPrefix: 'encryption' })
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!isSettingUp) {
      setTimedOut(false)
      return
    }

    const timer = setTimeout(() => setTimedOut(true), KEY_EXCHANGE_TIMEOUT)
    return () => clearTimeout(timer)
  }, [isSettingUp])

  if (!isSettingUp && !error) return null

  const showError = error || timedOut

  return (
    <div
      className={css({
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
      })}
    >
      <VStack gap="1rem" alignItems="center">
        {showError ? (
          <>
            <RiAlertFill size={36} color="#f87171" />
            <Text
              className={css({
                color: '#f87171',
                fontSize: '1.1rem',
                fontWeight: 500,
                textAlign: 'center',
              })}
            >
              {timedOut ? t('error.timeout') : t('error.title')}
            </Text>
            <Text
              className={css({
                color: 'greyscale.300',
                fontSize: '0.85rem',
                textAlign: 'center',
                maxWidth: '20rem',
              })}
            >
              {error || t('error.timeoutHint')}
            </Text>
            <Button
              variant="primary"
              size="sm"
              onPress={() => window.location.reload()}
            >
              <RiRefreshLine size={16} />
              {t('error.refresh')}
            </Button>
          </>
        ) : (
          <>
            <RiLockFill size={32} color="white" />
            <Text
              className={css({
                color: 'white',
                fontSize: '1.1rem',
                fontWeight: 500,
                textAlign: 'center',
              })}
            >
              {t('settingUp.title')}
            </Text>
            <Text
              className={css({
                color: 'greyscale.300',
                fontSize: '0.85rem',
                textAlign: 'center',
                maxWidth: '20rem',
              })}
            >
              {t('settingUp.description')}
            </Text>
            <Spinner />
          </>
        )}
      </VStack>
    </div>
  )
}
