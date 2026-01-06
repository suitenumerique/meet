import { css, cx } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { Spinner } from '@/primitives/Spinner'
import { Button, Text } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { RecordingStatuses } from '../hooks/useRecordingStatuses'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { ConnectionState } from 'livekit-client'
import { Button as RACButton } from 'react-aria-components'
import { parseLineBreaks } from '@/utils/parseLineBreaks'

const Layout = ({ children }: { children: ReactNode }) => (
  <div
    className={css({
      marginBottom: '80px',
      width: '100%',
    })}
  >
    {children}
  </div>
)

interface ControlsButtonProps {
  i18nKeyPrefix: string
  statuses: RecordingStatuses
  handle: () => void
  isPendingToStart: boolean
  isPendingToStop: boolean
  openSidePanel: () => void
}

const MIN_SPINNER_DISPLAY_TIME = 2000

export const ControlsButton = ({
  i18nKeyPrefix,
  statuses,
  handle,
  isPendingToStart,
  isPendingToStop,
  openSidePanel,
}: ControlsButtonProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: i18nKeyPrefix })

  // Focus management: focus the primary action button when this side panel opens.
  const primaryActionRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    requestAnimationFrame(() => {
      if (primaryActionRef.current) {
        primaryActionRef.current.focus({ preventScroll: true })
      }
    })
  }, [])

  const room = useRoomContext()
  const isRoomConnected = room.state == ConnectionState.Connected

  const [showSaving, setShowSaving] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout>()

  const isSaving = statuses.isSaving || isPendingToStop
  const isDisabled = !isRoomConnected || statuses.isAnotherModeStarted

  useEffect(() => {
    if (isSaving) {
      clearTimeout(timeoutRef.current)
      setShowSaving(true)
    } else if (showSaving) {
      timeoutRef.current = setTimeout(() => {
        setShowSaving(false)
      }, MIN_SPINNER_DISPLAY_TIME)
    }

    return () => clearTimeout(timeoutRef.current)
  }, [isSaving, showSaving])

  // Saving state
  if (showSaving) {
    return (
      <Layout>
        <HStack width="100%" height="46px" justify="center">
          <Spinner size={30} />
          <Text variant="body">{t('button.saving')}</Text>
        </HStack>
      </Layout>
    )
  }

  // Starting state
  if (statuses.isStarting || isPendingToStart) {
    return (
      <Layout>
        <HStack width="100%" height="46px" justify="center">
          <Spinner size={30} />
          {t('button.starting')}
        </HStack>
      </Layout>
    )
  }

  // Active state (Stop button)
  if (statuses.isStarted) {
    return (
      <Layout>
        <Button
          variant="tertiary"
          fullWidth
          onPress={handle}
          isDisabled={isDisabled}
          ref={primaryActionRef}
        >
          {t('button.stop')}
        </Button>
      </Layout>
    )
  }

  // Inactive state (Start button)
  return (
    <Layout>
      {statuses.isAnotherModeStarted && (
        <RACButton
          className={css({
            backgroundColor: 'primary.50',
            border: '1px solid',
            borderColor: 'primary.200',
            borderRadius: '6px',
            padding: '0.75rem',
            marginBottom: '0.75rem',
            display: 'flex',
            justifyContent: 'left',
            textAlign: 'left',
            alignItems: 'center',
            width: '100%',
            cursor: 'pointer',
            _hover: {
              backgroundColor: 'primary.100',
              borderColor: 'primary.400',
            },
          })}
          onPress={() => openSidePanel()}
        >
          <span
            className={cx(
              'material-icons',
              css({
                color: 'primary.500',
                marginRight: '1rem',
              })
            )}
          >
            info
          </span>
          <Text variant={'smNote'}>
            {parseLineBreaks(t('button.anotherModeStarted'))}
          </Text>
          <span
            className={cx(
              'material-icons',
              css({
                color: 'primary.500',
                marginLeft: 'auto',
              })
            )}
          >
            chevron_right
          </span>
        </RACButton>
      )}
      <Button
        variant={isDisabled ? 'primary' : 'tertiary'}
        fullWidth
        onPress={handle}
        isDisabled={isDisabled}
        size="compact"
        ref={primaryActionRef}
      >
        {t('button.start')}
      </Button>
    </Layout>
  )
}
