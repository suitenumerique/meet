import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { generateRoomId, useCreateRoom } from '../../rooms'
import { useUser } from '@/features/auth'
import { Spinner } from '@/primitives/Spinner'
import { Button, Text } from '@/primitives'
import { VStack } from '@/styled-system/jsx'
import { CallbackIdHandler } from '../utils/CallbackIdHandler'
import { PopupWindow } from '../utils/PopupWindow'
import { ApiEncryptionMode } from '@/features/rooms/api/ApiRoom'
import { generatePassphrase } from '@/features/encryption/lobbyKeyExchange'
import { useVaultClient } from '@/features/encryption'
import {
  RiVideoOnLine,
  RiLockLine,
  RiShieldCheckLine,
} from '@remixicon/react'

const callbackIdHandler = new CallbackIdHandler()
const popupWindow = new PopupWindow()

export const CreatePopup = () => {
  const { isLoggedIn } = useUser({ fetchUserOptions: { attemptSilent: false } })
  const { mutateAsync: createRoom } = useCreateRoom()
  const { t } = useTranslation('sdk', { keyPrefix: 'createPopup' })
  const { client: vaultClient, hasKeys, isReady: vaultReady } = useVaultClient()

  const callbackId = useMemo(() => callbackIdHandler.getOrCreate(), [])
  const [isCreating, setIsCreating] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const onboardingContainerRef = useRef<HTMLDivElement>(null)

  // Handle unauthenticated users by redirecting to login.
  // Don't send callbackId to parent yet — we need the user to pick
  // an encryption mode first. The callbackId is sent with createRoom.
  useEffect(() => {
    if (isLoggedIn === false) {
      popupWindow.navigateToAuthentication()
    }
  }, [isLoggedIn])

  const handleCreate = useCallback(async (mode: ApiEncryptionMode) => {
    setIsCreating(true)

    try {
      const slug = generateRoomId()
      const hash =
        mode === ApiEncryptionMode.BASIC ? generatePassphrase() : undefined

      // For advanced mode, generate the vault key at creation time
      let encryptedSymmetricKey = ''
      if (mode === ApiEncryptionMode.ADVANCED && vaultClient) {
        // encryptWithoutKey requires data to encrypt, but we only care about
        // the generated symmetric key (encryptedKeys), not the encrypted content.
        // The same symmetric key will be used for all streams (video/audio/chat).
        const dummyData = new Uint8Array(32).buffer
        const { publicKey } = await vaultClient.getPublicKey()
        const { encryptedKeys } = await vaultClient.encryptWithoutKey(
          dummyData,
          { self: publicKey }
        )
        const keyBytes = new Uint8Array(encryptedKeys['self'])
        encryptedSymmetricKey = btoa(String.fromCharCode(...keyBytes))
      }

      const roomData = await createRoom({
        slug,
        encryptionMode: mode,
        encryptedSymmetricKey,
      })

      popupWindow.sendRoomData({ slug: roomData.slug, hash }, () => {
        callbackIdHandler.clear()
        popupWindow.close()
      })
    } catch (error) {
      console.error('Failed to create meeting room:', error)
      setIsCreating(false)
    }
  }, [createRoom, vaultClient])

  // Handle vault onboarding completion
  useEffect(() => {
    if (!vaultClient || !showOnboarding) return

    const handleOnboardingComplete = () => {
      setShowOnboarding(false)
      // After onboarding, create the advanced encrypted room
      handleCreate(ApiEncryptionMode.ADVANCED)
    }

    const handleInterfaceClosed = () => {
      setShowOnboarding(false)
    }

    vaultClient.on('onboarding:complete', handleOnboardingComplete)
    vaultClient.on('interface:closed', handleInterfaceClosed)

    return () => {
      vaultClient.off('onboarding:complete', handleOnboardingComplete)
      vaultClient.off('interface:closed', handleInterfaceClosed)
    }
  }, [vaultClient, showOnboarding, handleCreate])

  // Open vault onboarding when container is ready
  useEffect(() => {
    if (showOnboarding && vaultClient && onboardingContainerRef.current) {
      console.info('[CreatePopup] Opening vault onboarding in container', onboardingContainerRef.current)
      vaultClient.openOnboarding(onboardingContainerRef.current)
    } else if (showOnboarding) {
      console.warn('[CreatePopup] Cannot open onboarding:', {
        vaultClient: !!vaultClient,
        container: !!onboardingContainerRef.current,
      })
    }
  }, [showOnboarding, vaultClient])

  const handleAdvancedClick = () => {
    if (hasKeys) {
      // Already onboarded, create directly
      handleCreate(ApiEncryptionMode.ADVANCED)
    } else if (vaultClient) {
      // Need onboarding first
      setShowOnboarding(true)
    }
  }

  if (!isLoggedIn || isCreating) {
    return (
      <div
        className={css({
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          width: '100%',
        })}
      >
        <Spinner />
      </div>
    )
  }

  if (showOnboarding) {
    return (
      <div className={css({ position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'white' })}>
        <div
          ref={onboardingContainerRef}
          className={css({ position: 'absolute', inset: 0 })}
        />
        <Button
          variant="tertiaryText"
          size="sm"
          onPress={() => setShowOnboarding(false)}
          style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', zIndex: 101 }}
        >
          ←
        </Button>
      </div>
    )
  }

  // Vault is available if the client was loaded (script + init succeeded).
  // Auth context (isReady) may not be set yet — the onboarding handles its own auth.
  const vaultAvailable = !!vaultClient

  return (
    <div
      className={css({
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        width: '100%',
        padding: '2rem',
      })}
    >
      <VStack gap="0.75rem" alignItems="stretch" maxWidth="22rem" width="100%">
        <Text
          variant="sm"
          bold
          className={css({ textAlign: 'center', fontSize: '1.1rem', marginBottom: '0.5rem' })}
        >
          {t('title')}
        </Text>

        <Button
          variant="primary"
          fullWidth
          onPress={() => handleCreate(ApiEncryptionMode.NONE)}
        >
          <RiVideoOnLine size={18} />
          {t('standard')}
        </Button>

        <Button
          variant="secondary"
          fullWidth
          onPress={() => handleCreate(ApiEncryptionMode.BASIC)}
        >
          <RiLockLine size={18} />
          {t('encrypted')}
        </Button>

        <div
          className={css({
            borderTop: '1px solid',
            borderColor: 'greyscale.100',
            margin: '0.25rem 0',
          })}
        />

        <Button
          variant="secondary"
          fullWidth
          isDisabled={!vaultAvailable}
          onPress={handleAdvancedClick}
          style={{ opacity: vaultAvailable ? 1 : 0.4, cursor: vaultAvailable ? 'pointer' : 'not-allowed' }}
        >
          <RiShieldCheckLine size={18} />
          {t('advancedEncrypted')}
        </Button>
        <Text
          variant="note"
          className={css({ color: 'greyscale.500', fontSize: '0.75rem', lineHeight: 1.4 })}
        >
          {t('advancedDescription')}
        </Text>
      </VStack>
    </div>
  )
}
