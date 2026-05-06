import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Field, Ul, H, P, Form, Dialog } from '@/primitives'
import { css } from '@/styled-system/css'
import { navigateTo } from '@/navigation/navigateTo'
import { isRoomValid } from '@/features/rooms'
import { normalizeRoomId } from '@/features/rooms/utils/isRoomValid'
import { fetchRoom } from '@/features/rooms/api/fetchRoom'
import { ApiEncryptionMode } from '@/features/rooms/api/ApiRoom'

export const JoinMeetingDialog = () => {
  const { t } = useTranslation('home')
  const [step, setStep] = useState<'room' | 'passphrase'>('room')
  const [roomId, setRoomId] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const parseInput = (input: string): { roomId: string; hash: string } => {
    const trimmed = input.trim()
    try {
      const url = new URL(trimmed)
      const id = url.pathname.replace(/^\//, '')
      return { roomId: id, hash: url.hash.slice(1) }
    } catch {
      // Not a URL — treat as room code, normalize (add hyphens if 10 chars)
      const raw = trimmed.replace(`${window.location.origin}/`, '')
      return { roomId: normalizeRoomId(raw), hash: '' }
    }
  }

  const handleRoomSubmit = async (data: { roomId?: FormDataEntryValue }) => {
    const input = data.roomId as string
    const parsed = parseInput(input)

    // If URL already has a hash, navigate directly with it
    if (parsed.hash) {
      navigateTo('room', parsed.roomId)
      window.location.hash = parsed.hash
      return
    }

    // Check if the room uses basic encryption (needs passphrase)
    setIsLoading(true)
    try {
      const room = await fetchRoom({ roomId: parsed.roomId })
      if (room.encryption_mode === ApiEncryptionMode.BASIC) {
        setRoomId(parsed.roomId)
        setStep('passphrase')
        return
      }
      navigateTo('room', parsed.roomId)
    } catch {
      // Room doesn't exist yet or error — navigate anyway
      navigateTo('room', parsed.roomId)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePassphraseSubmit = (data: { passphrase?: FormDataEntryValue }) => {
    const passphrase = (data.passphrase as string).trim()
    navigateTo('room', roomId)
    window.location.hash = passphrase
  }

  const validateRoomId = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return null
    const { roomId: id } = parseInput(trimmed)
    return !isRoomValid(id) ? (
      <>
        <p>{t('joinInputError')}</p>
        <Ul>
          <li>{window.location.origin}/uio-azer-jkl</li>
          <li>uio-azer-jkl</li>
          <li>uioazerjkl</li>
        </Ul>
      </>
    ) : null
  }

  if (step === 'passphrase') {
    return (
      <Dialog title={t('joinMeeting')}>
        <Form onSubmit={handlePassphraseSubmit} submitLabel={t('joinPassphraseSubmit')}>
          <P
            dangerouslySetInnerHTML={{
              __html: t('joinPassphraseDescription', {
                interpolation: { escapeValue: false },
              }),
            }}
          />

          <div
            className={css({
              backgroundColor: 'greyscale.100',
              borderRadius: '0.5rem',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              fontSize: '0.8rem',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              lineHeight: '1.5',
              border: '1px solid',
              borderColor: 'greyscale.200',
              '& strong': {
                color: '#16a34a',
                fontWeight: 700,
              },
            })}
            dangerouslySetInnerHTML={{
              __html: t('joinPassphraseExample', {
                origin: window.location.origin,
                interpolation: { escapeValue: false },
              }),
            }}
          />

          {/* eslint-disable jsx-a11y/no-autofocus */}
          <Field
            type="text"
            autoFocus
            isRequired
            name="passphrase"
            label={t('joinPassphraseLabel')}
            errorMessage={t('joinPassphraseError')}
          />

          <P
            className={css({
              fontSize: '0.8rem',
              color: '#b45309',
              marginTop: '0.5rem',
            })}
          >
            {t('joinPassphraseWarning')}
          </P>
        </Form>
      </Dialog>
    )
  }

  return (
    <Dialog title={t('joinMeeting')}>
      <Form onSubmit={handleRoomSubmit} submitLabel={isLoading ? '...' : t('joinInputSubmit')}>
        {/* eslint-disable jsx-a11y/no-autofocus -- Focus on input when modal opens, required for accessibility */}
        <Field
          type="text"
          autoFocus
          isRequired
          name="roomId"
          label={t('joinInputLabel')}
          description={t('joinInputExample', {
            example: window.origin + '/azer-tyu-qsdf',
          })}
          validate={validateRoomId}
        />
      </Form>
      <H lvl={2}>{t('joinMeetingTipHeading')}</H>
      <P last>{t('joinMeetingTipContent')}</P>
    </Dialog>
  )
}
