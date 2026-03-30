/**
 * Overlay shown during encryption key exchange.
 *
 * When a participant joins an encrypted room, there's a brief period
 * between connection and receiving the symmetric key where media
 * cannot be decrypted. This overlay provides feedback during that time.
 */
import { css } from '@/styled-system/css'
import { VStack } from '@/styled-system/jsx'
import { Text } from '@/primitives'
import { Spinner } from '@/primitives/Spinner'
import { RiLockFill, RiAlertFill } from '@remixicon/react'
import { useTranslation } from 'react-i18next'

export function EncryptionSetupOverlay({
  isSettingUp,
  error,
}: {
  isSettingUp: boolean
  error: string | null
}) {
  const { t } = useTranslation('rooms', { keyPrefix: 'encryption' })

  if (!isSettingUp && !error) return null

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
        <RiLockFill size={32} color="white" />
        {error ? (
          <>
            <RiAlertFill size={32} color="#f87171" />
            <Text
              className={css({
                color: '#f87171',
                fontSize: '1.1rem',
                fontWeight: 500,
                textAlign: 'center',
              })}
            >
              {t('error.title')}
            </Text>
            <Text
              className={css({
                color: 'greyscale.300',
                fontSize: '0.85rem',
                textAlign: 'center',
                maxWidth: '20rem',
              })}
            >
              {error}
            </Text>
            <Text
              className={css({
                color: 'greyscale.400',
                fontSize: '0.75rem',
                textAlign: 'center',
                maxWidth: '20rem',
              })}
            >
              {t('error.hint')}
            </Text>
          </>
        ) : (
          <>
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
