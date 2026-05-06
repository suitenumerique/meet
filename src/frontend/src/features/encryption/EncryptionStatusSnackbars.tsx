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
import { ParticipantKind, RemoteParticipant, RoomEvent } from 'livekit-client'
import { useRoomContext } from '@livekit/components-react'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { useSettingsDialog, SettingsDialogExtendedKey } from '@/features/settings'
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
  const room = useRoomContext()
  const isAdmin = useIsAdminOrOwner()
  const { openSettingsDialog } = useSettingsDialog()

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

  const [sipParticipant, setSipParticipant] = useState<string | null>(null)
  const [sipDismissed, dismissSip] = useTransient(
    sipParticipant,
    DISPLAY_DURATION_MS
  )

  // Detect SIP / phone participants joining an encrypted meeting.
  useEffect(() => {
    if (!isAdmin) return
    if (phase !== EncryptionPhase.ENCRYPTED) return

    const handler = (participant: RemoteParticipant) => {
      if (participant.kind === ParticipantKind.SIP) {
        setSipParticipant(participant.name || participant.identity)
      }
    }
    room.on(RoomEvent.ParticipantConnected, handler)
    room.remoteParticipants.forEach((p) => {
      if (p.kind === ParticipantKind.SIP) {
        setSipParticipant(p.name || p.identity)
      }
    })
    return () => {
      room.off(RoomEvent.ParticipantConnected, handler)
    }
  }, [room, isAdmin, phase])

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
      {sipDismissed && phase === EncryptionPhase.ENCRYPTED && (
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
                {t('sipBody', { name: sipDismissed })}
              </Text>
            </VStack>
            <Button
              size="sm"
              variant="text"
              className={css({ color: 'white !important' })}
              onPress={() => {
                openSettingsDialog(SettingsDialogExtendedKey.SECURITY)
                dismissSip()
              }}
            >
              {t('openSettings')}
            </Button>
          </HStack>
        </SnackbarShell>
      )}
    </>
  )
}
