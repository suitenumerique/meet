import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { Spinner } from '@/primitives/Spinner'
import { Button, Text } from '@/primitives'
import { RiArrowRightSLine, RiInformationLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import type { RecordingStatuses } from '../hooks/useRecordingStatuses'
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

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
          variant="primary"
          fullWidth
          onPress={handle}
          isDisabled={isDisabled}
          size="compact"
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
            boxSizing: 'border-box',
            width: '100%',
            minHeight: '48px',
            marginBottom: '0.75rem',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textAlign: 'left',
            cursor: 'pointer',
            color: 'content.semantic.brand.primary',
            fontSize: 'sm',
            fontWeight: 'medium',
            lineHeight: '1.25rem',
            backgroundColor: 'background.semantic.brand.tertiary',
            border: '1px solid',
            borderColor: 'border.semantic.brand.tertiary',
            borderRadius: '8px',
            transition: 'background-color 150ms',
            '&[data-hovered]': {
              backgroundColor: 'background.semantic.brand.tertiary-hover',
            },
          })}
          onPress={() => openSidePanel()}
        >
          <RiInformationLine
            size={24}
            aria-hidden="true"
            className={css({ flexShrink: 0 })}
          />
          <span className={css({ flex: '1 1 auto', minWidth: 0 })}>
            {parseLineBreaks(t('button.anotherModeStarted'))}
          </span>
          <RiArrowRightSLine
            size={24}
            aria-hidden="true"
            className={css({
              flexShrink: 0,
              color: 'content.semantic.brand.tertiary',
            })}
          />
        </RACButton>
      )}
      <Button
        variant="primary"
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
