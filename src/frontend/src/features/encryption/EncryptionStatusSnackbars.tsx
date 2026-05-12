/**
 * Transient bottom snackbars announcing encryption state changes:
 *  - "Encryption paused while transcription is on"
 *  - "Encryption was turned off for this meeting"
 *  - "A participant can't decrypt this meeting" (admin only, with CTA)
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { HStack, VStack } from '@/styled-system/jsx'
import { Button, Text } from '@/primitives'
import { ParticipantKind, RemoteParticipant } from 'livekit-client'
import { useRemoteParticipants } from '@livekit/components-react'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { EncryptionPhase, PauseReason } from './encryptionStatusTypes'
import { useEncryptionStatus } from './useEncryptionStatus'

const DISPLAY_DURATION_MS = 8000

const SnackbarShell = ({ children }: { children: React.ReactNode }) => (
  <div
    className={css({
      position: 'fixed',
      bottom: '5rem',
      right: '1rem',
      zIndex: 1500,
      maxWidth: '24rem',
      padding: '0.85rem 1rem',
      backgroundColor: '#1e3a5f',
      borderRadius: '0.5rem',
      boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
    })}
    role="status"
  >
    {children}
  </div>
)

function useTransient<T>(value: T, displayMs: number) {
  const [shown, setShown] = useState<T | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!value) return
    setShown(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setShown(null), displayMs)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [value, displayMs])

  return [shown, () => setShown(null)] as const
}

export function EncryptionStatusSnackbars() {
  const { t } = useTranslation('rooms', { keyPrefix: 'encryption.snackbar' })
  const { phase, pauseReason, pausedByMe } = useEncryptionStatus()
  const remoteParticipants = useRemoteParticipants()
  const isAdmin = useIsAdminOrOwner()
  const { toggleAdmin, isAdminOpen } = useSidePanel()

  const [pauseSignal, setPauseSignal] = useState<{
    reason?: PauseReason
    pausedByMe: boolean
  } | null>(null)

  const previousPhase = useRef(phase)
  useEffect(() => {
    if (
      previousPhase.current !== EncryptionPhase.PAUSED &&
      phase === EncryptionPhase.PAUSED
    ) {
      setPauseSignal({ reason: pauseReason, pausedByMe })
    }
    previousPhase.current = phase
  }, [phase, pauseReason, pausedByMe])

  const [pauseToast, dismissPauseToast] = useTransient(
    pauseSignal,
    DISPLAY_DURATION_MS
  )

  // The SIP-blocked snackbar persists as long as a SIP participant is
  // present in the encrypted room — admin needs to either pause encryption
  // (Settings → Security → This meeting) or wait for the SIP user to hang
  // up. Manual dismiss hides it until a different SIP participant arrives.
  //
  // useRemoteParticipants re-renders on participant join/leave/state — that
  // gives us a reactive participant list without manual event listeners,
  // which is more reliable than the prior subscribe-on-mount approach.
  const [sipDismissedIdentity, setSipDismissedIdentity] = useState<string | null>(null)

  const isSip = (p: RemoteParticipant) =>
    p.kind === ParticipantKind.SIP || p.identity.startsWith('sip_')

  const sipParticipant =
    isAdmin && phase === EncryptionPhase.ENCRYPTED
      ? remoteParticipants.find(isSip) ?? null
      : null

  const sipLabel = sipParticipant
    ? sipParticipant.name || sipParticipant.identity
    : null

  const showSipSnack =
    sipParticipant !== null &&
    sipDismissedIdentity !== sipParticipant.identity

  return (
    <>
      {pauseToast && (
        <SnackbarShell>
          <HStack
            gap="1rem"
            justify="space-between"
            alignItems="center"
            className={css({ width: '100%' })}
          >
            <VStack gap="0.15rem" alignItems="start">
              <Text
                variant="sm"
                margin={false}
                className={css({ color: 'white', fontWeight: 600 })}
              >
                {pauseToast.pausedByMe
                  ? t('pausedByMeTitle')
                  : t('pausedTitle')}
              </Text>
              <Text
                variant="note"
                margin={false}
                className={css({
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: '0.8rem',
                })}
              >
                {pauseToast.reason === 'transcript'
                  ? t('reasonTranscript')
                  : pauseToast.reason === 'recording'
                    ? t('reasonRecording')
                    : pauseToast.reason === 'sip_participant'
                      ? t('reasonSip')
                      : t('reasonManual')}
              </Text>
            </VStack>
            <Button
              size="sm"
              variant="text"
              onPress={dismissPauseToast}
              className={css({ color: 'white !important' })}
            >
              {t('dismiss')}
            </Button>
          </HStack>
        </SnackbarShell>
      )}
      {showSipSnack && phase === EncryptionPhase.ENCRYPTED && (
        <SnackbarShell>
          <HStack
            gap="1rem"
            justify="space-between"
            alignItems="center"
            className={css({ width: '100%' })}
          >
            <VStack gap="0.15rem" alignItems="start">
              <Text
                variant="sm"
                margin={false}
                className={css({ color: 'white', fontWeight: 600 })}
              >
                {t('sipTitle')}
              </Text>
              <Text
                variant="note"
                margin={false}
                className={css({
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: '0.8rem',
                })}
              >
                {t('sipBody', { name: sipLabel })}
              </Text>
            </VStack>
            {!isAdminOpen && (
              <Button
                size="sm"
                variant="text"
                className={css({ color: 'white !important' })}
                onPress={toggleAdmin}
              >
                {t('openAdmin')}
              </Button>
            )}
            <Button
              size="sm"
              variant="text"
              className={css({ color: 'white !important' })}
              onPress={() =>
                sipParticipant &&
                setSipDismissedIdentity(sipParticipant.identity)
              }
            >
              {t('dismiss')}
            </Button>
          </HStack>
        </SnackbarShell>
      )}
    </>
  )
}
