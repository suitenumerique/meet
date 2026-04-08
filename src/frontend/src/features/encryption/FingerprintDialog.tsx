/**
 * Dialog showing a participant's encryption fingerprint.
 * Allows the admin to verify, accept, or refuse the fingerprint.
 *
 * This connects to the encryption library's VaultClient to check/accept/refuse
 * fingerprints from the TOFU (Trust On First Use) registry.
 */
import { css } from '@/styled-system/css'
import { VStack, HStack } from '@/styled-system/jsx'
import { Dialog, Text, Button } from '@/primitives'
import { Avatar } from '@/components/Avatar'
import {
  RiShieldCheckFill,
  RiShieldCheckLine,
  RiAlertLine,
  RiCheckLine,
  RiCloseLine,
} from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { useVaultClient } from './VaultClientProvider'
import { useEffect, useState } from 'react'

interface FingerprintDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  participantName: string
  participantEmail?: string
  suiteUserId?: string
  isAuthenticated: boolean
  encryptionMode?: 'basic' | 'advanced' | 'none'
}

type FingerprintStatus = 'loading' | 'no-key' | 'trusted' | 'refused' | 'unknown' | 'error'

export function FingerprintDialog({
  isOpen,
  onOpenChange,
  participantName,
  participantEmail,
  suiteUserId,
  isAuthenticated,
  encryptionMode,
}: FingerprintDialogProps) {
  const { t } = useTranslation('rooms', { keyPrefix: 'encryption.fingerprint' })
  const { client: vaultClient } = useVaultClient()
  const [status, setStatus] = useState<FingerprintStatus>('loading')
  const [fingerprint, setFingerprint] = useState<string | null>(null)

  const isBasicMode = encryptionMode !== 'advanced'

  useEffect(() => {
    if (!isOpen) return
    // In basic mode, no fingerprint check — identity is from ProConnect only
    if (isBasicMode) {
      setStatus(isAuthenticated ? 'no-key' : 'no-key')
      return
    }
    if (!vaultClient) {
      setStatus('error')
      return
    }
    if (!suiteUserId) {
      setStatus(isAuthenticated ? 'no-key' : 'no-key')
      return
    }

    let cancelled = false

    async function checkFingerprint() {
      try {
        // Timeout after 3 seconds — the encryption server may not be available
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 3000)
        )

        const fetchResult = await Promise.race([
          vaultClient!.fetchPublicKeys([suiteUserId!]),
          timeout,
        ])

        const publicKey = fetchResult.publicKeys[suiteUserId!]

        if (!publicKey || cancelled) {
          setStatus('no-key')
          return
        }

        const { results } = await Promise.race([
          vaultClient!.checkFingerprints(
            { [suiteUserId!]: '' },
            undefined
          ),
          timeout,
        ])

        if (cancelled) return

        const result = results.find((r) => r.userId === suiteUserId)
        if (result) {
          setFingerprint(result.providedFingerprint)
          setStatus(result.status)
        } else {
          setStatus('no-key')
        }
      } catch {
        if (!cancelled) setStatus('no-key')
      }
    }

    checkFingerprint()
    return () => { cancelled = true }
  }, [isOpen, vaultClient, suiteUserId, isAuthenticated])

  const handleAccept = async () => {
    if (!vaultClient || !suiteUserId || !fingerprint) return
    try {
      await vaultClient.acceptFingerprint(suiteUserId, fingerprint)
      setStatus('trusted')
    } catch {
      // Failed to accept
    }
  }

  const handleRefuse = async () => {
    if (!vaultClient || !suiteUserId || !fingerprint) return
    try {
      await vaultClient.refuseFingerprint(suiteUserId, fingerprint)
      setStatus('refused')
    } catch {
      // Failed to refuse
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      role="dialog"
      type="flex"
      title={t('title')}
    >
      <VStack
        gap="0.75rem"
        alignItems="start"
        className={css({ maxWidth: '22rem' })}
      >
        <HStack gap="0.65rem" className={css({ width: '100%' })}>
          <div className={css({ flexShrink: 0, transform: 'scale(0.85)' })}>
            <Avatar name={participantName} bgColor="rgb(87, 44, 216)" />
          </div>
          <VStack gap="0" alignItems="start">
            <Text className={css({ fontWeight: 600, fontSize: '0.9rem' })}>{participantName}</Text>
            <Text variant="note" className={css({ fontSize: '0.8rem', color: 'greyscale.500' })}>
              {participantEmail || t('anonymous')}
            </Text>
          </VStack>
        </HStack>

        <Text variant="note" className={css({ fontSize: '0.8rem' })}>
          {t('description')}
        </Text>

        {status === 'loading' && (
          <Text variant="note">{t('loading')}</Text>
        )}

        {status === 'no-key' && isBasicMode && isAuthenticated && (
          <HStack
            gap="0.5rem"
            className={css({
              backgroundColor: '#eff6ff',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              width: '100%',
              border: '1px solid #bfdbfe',
            })}
          >
            <RiShieldCheckLine size={20} color="#3b82f6" className={css({ flexShrink: 0 })} />
            <Text variant="note" className={css({ fontSize: '0.8rem' })}>
              {t('noKeyBasicAuthenticated')}
            </Text>
          </HStack>
        )}

        {status === 'no-key' && !(isBasicMode && isAuthenticated) && (
          <HStack
            gap="0.5rem"
            className={css({
              backgroundColor: '#fffbeb',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              width: '100%',
              border: '1px solid #fde68a',
            })}
          >
            <RiAlertLine size={20} color="#f59e0b" className={css({ flexShrink: 0 })} />
            <Text variant="note" className={css({ fontSize: '0.8rem' })}>
              {isAuthenticated ? t('noKey') : t('noKeyAnonymous')}
            </Text>
          </HStack>
        )}

        {status === 'error' && (
          <Text variant="note" className={css({ color: '#ef4444' })}>
            {t('error')}
          </Text>
        )}

        {(status === 'trusted' || status === 'refused' || status === 'unknown') && fingerprint && (
          <>
            <VStack
              gap="0.25rem"
              className={css({
                backgroundColor: 'greyscale.50',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                width: '100%',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                letterSpacing: '0.05em',
                wordBreak: 'break-all',
              })}
            >
              <Text variant="note" className={css({ fontSize: '0.7rem', fontFamily: 'inherit' })}>
                {t('fingerprintLabel')}
              </Text>
              {fingerprint}
            </VStack>

            {status === 'trusted' && (
              <VStack gap="0.25rem" alignItems="start">
                <HStack gap="0.5rem" className={css({ color: '#22c55e' })}>
                  <RiShieldCheckFill size={18} />
                  <Text className={css({ fontSize: '0.85rem', fontWeight: 600, color: 'inherit' })}>
                    {t('trusted')}
                  </Text>
                </HStack>
                <Text variant="note" className={css({ fontSize: '0.8rem' })}>
                  {t('trustedDescription')}
                </Text>
              </VStack>
            )}

            {status === 'refused' && (
              <VStack gap="0.25rem" alignItems="start">
                <HStack gap="0.5rem" className={css({ color: '#ef4444' })}>
                  <RiCloseLine size={18} />
                  <Text className={css({ fontSize: '0.85rem', fontWeight: 600, color: 'inherit' })}>
                    {t('refused')}
                  </Text>
                </HStack>
                <Text variant="note" className={css({ fontSize: '0.8rem' })}>
                  {t('refusedDescription')}
                </Text>
              </VStack>
            )}

            {status === 'unknown' && (
              <VStack gap="0.5rem" className={css({ width: '100%' })}>
                <Text variant="note" className={css({ fontSize: '0.8rem' })}>
                  {t('unknownDescription')}
                </Text>
                <Text variant="note" className={css({ fontSize: '0.75rem', fontStyle: 'italic' })}>
                  {t('fingerprintHint')}
                </Text>
                <HStack gap="0.5rem">
                  <Button size="sm" variant="primary" onPress={handleAccept}>
                    <RiCheckLine size={16} />
                    {t('accept')}
                  </Button>
                  <Button size="sm" variant="secondaryText" onPress={handleRefuse}>
                    <RiCloseLine size={16} />
                    {t('refuse')}
                  </Button>
                </HStack>
              </VStack>
            )}
          </>
        )}
      </VStack>
    </Dialog>
  )
}
