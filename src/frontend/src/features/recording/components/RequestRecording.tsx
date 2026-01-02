import { Button, H, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { useEffect, useRef, useState } from 'react'
import { Spinner } from '@/primitives/Spinner.tsx'
import { NotificationDuration } from '@/features/notifications/NotificationDuration'

interface RequestRecordingProps {
  heading: string
  body: string
  buttonLabel: string
  handleRequest: () => Promise<void>
}

export const RequestRecording = ({
  heading,
  body,
  buttonLabel,
  handleRequest,
}: RequestRecordingProps) => {
  const [isDisabled, setIsDisabled] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const onPress = async () => {
    setIsDisabled(true)

    try {
      await handleRequest()
    } catch {
      setIsDisabled(false)
      return
    }

    timeoutRef.current = setTimeout(() => {
      setIsDisabled(false)
    }, NotificationDuration.RECORDING_REQUESTED)
  }

  return (
    <div
      className={css({
        backgroundColor: 'neutral.50',
        borderRadius: '5px',
        border: '1px solid',
        borderColor: 'neutral.200',
        paddingY: '1rem',
        paddingX: '1rem',
        display: 'flex',
        flexDirection: 'column',
        marginBottom: '1.5rem',
      })}
    >
      <HStack justify="start" alignItems="center" marginBottom="0.5rem">
        <span className="material-symbols">person_raised_hand</span>
        <H lvl={3} margin={false} padding={false}>
          {heading}
        </H>
      </HStack>
      <Text variant="smNote" wrap="pretty">
        {body}
      </Text>
      <div
        className={css({
          marginTop: '1rem',
        })}
      >
        <Button
          variant="tertiary"
          fullWidth
          onPress={onPress}
          isDisabled={isDisabled}
        >
          {isDisabled && <Spinner size={24} />}
          {buttonLabel}
        </Button>
      </div>
    </div>
  )
}
