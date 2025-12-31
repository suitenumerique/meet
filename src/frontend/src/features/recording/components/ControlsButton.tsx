import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { Spinner } from '@/primitives/Spinner'
import { Button, Text } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { RecordingStatuses } from '../hooks/useRecordingStatuses'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { ConnectionState } from 'livekit-client'

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
}

const MIN_SPINNER_DISPLAY_TIME = 2000

export const ControlsButton = ({
  i18nKeyPrefix,
  statuses,
  handle,
  isPendingToStart,
  isPendingToStop,
}: ControlsButtonProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: i18nKeyPrefix })

  const room = useRoomContext()
  const isRoomConnected = room.state == ConnectionState.Connected

  const [showSaving, setShowSaving] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout>()

  const isSaving = statuses.isSaving || isPendingToStop
  const isDisabled = !isRoomConnected

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
        >
          {t('button.stop')}
        </Button>
      </Layout>
    )
  }

  // Inactive state (Start button)
  return (
    <Layout>
      <Button
        variant="tertiary"
        fullWidth
        onPress={handle}
        isDisabled={isDisabled}
      >
        {t('button.start')}
      </Button>
    </Layout>
  )
}
