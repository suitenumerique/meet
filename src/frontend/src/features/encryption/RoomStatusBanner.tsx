/**
 * Top-left status banner shown during a meeting.
 *
 * Renders a horizontal stack of pills, one per active state:
 *  - "End-to-end encrypted" / "Encryption paused"
 *  - "Recording in progress"
 *  - "Transcription in progress"
 *
 * Each pill auto-collapses to its icon a few seconds after appearing,
 * and expands back on hover.
 */
import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import {
  RiFileTextFill,
  RiLockFill,
  RiLockUnlockFill,
  RiRecordCircleFill,
} from '@remixicon/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { EncryptionPhase } from './encryptionStatusTypes'
import { useEncryptionStatus } from './useEncryptionStatus'

const COLLAPSE_DELAY_MS = 4000

interface PillProps {
  icon: React.ReactNode
  label: string
  background: string
  pulse?: boolean
}

function StatusPill({ icon, label, background, pulse }: PillProps) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setCollapsed(true), COLLAPSE_DELAY_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      role="status"
      aria-label={label}
      className={css({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.3rem 0.6rem',
        borderRadius: '1rem',
        border: '2px solid rgba(0, 0, 0, 0.3)',
        cursor: 'default',
        overflow: 'hidden',
        transition: 'max-width 300ms ease, padding-right 200ms ease',
        whiteSpace: 'nowrap',
      })}
      style={{
        backgroundColor: background,
        maxWidth: collapsed ? '2.2rem' : '20rem',
        paddingRight: collapsed ? '0.3rem' : '0.6rem',
        animation: pulse ? 'pulse_background 1.6s infinite' : undefined,
      }}
    >
      <span className={css({ flexShrink: 0, display: 'inline-flex' })}>
        {icon}
      </span>
      <span
        className={css({
          fontSize: '0.7rem',
          fontWeight: 600,
          color: 'white',
          letterSpacing: '0.02em',
          transition: 'opacity 200ms ease',
        })}
        style={{ opacity: collapsed ? 0 : 1 }}
      >
        {label}
      </span>
    </div>
  )
}

function useRecordingStatus() {
  const room = useRoomContext()
  const [isRecording, setIsRecording] = useState(!!room.isRecording)

  useEffect(() => {
    const handler = () => setIsRecording(!!room.isRecording)
    room.on(RoomEvent.RecordingStatusChanged, handler)
    return () => {
      room.off(RoomEvent.RecordingStatusChanged, handler)
    }
  }, [room])

  return isRecording
}

export function RoomStatusBanner() {
  const { t } = useTranslation('rooms', { keyPrefix: 'roomStatus' })
  const { phase, pauseReason } = useEncryptionStatus()
  const isRecording = useRecordingStatus()

  if (
    phase === EncryptionPhase.UNENCRYPTED &&
    !isRecording &&
    pauseReason !== 'transcript'
  ) {
    return null
  }

  return (
    <HStack
      gap="0.4rem"
      className={css({
        position: 'absolute',
        top: '0.5rem',
        left: '0.5rem',
        zIndex: 10,
      })}
    >
      {phase === EncryptionPhase.ENCRYPTED && (
        <StatusPill
          key="encrypted"
          icon={<RiLockFill size={13} color="white" />}
          label={t('encrypted')}
          background="#1e3a5f"
        />
      )}
      {phase === EncryptionPhase.PAUSED && (
        <StatusPill
          key="paused"
          icon={<RiLockUnlockFill size={13} color="white" />}
          label={t('paused')}
          background="#b45309"
        />
      )}
      {pauseReason === 'transcript' && (
        <StatusPill
          key="transcript"
          icon={<RiFileTextFill size={13} color="white" />}
          label={t('transcribing')}
          background="#7c2d12"
        />
      )}
      {isRecording && (
        <StatusPill
          key="recording"
          icon={<RiRecordCircleFill size={13} color="white" />}
          label={t('recording')}
          background="#b91c1c"
          pulse
        />
      )}
    </HStack>
  )
}
