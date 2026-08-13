import { useToast } from 'react-aria'
import { useRef } from 'react'

import { type ToastProps } from './Toast'
import { VStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { StyledToastContainer } from './StyledToastContainer'
import { disablePerformanceMode } from '@/stores/performanceMode'
import { captureEvent } from '@/features/analytics/telemetry'

// todo - make it closable
export function ToastCpuConstrained({ state, ...props }: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications', {
    keyPrefix: 'cpuConstrained',
  })
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)
  const toast = props.toast

  const handleKeepQuality = () => {
    captureEvent('cpu-constrained-degradation-cancelled')
    disablePerformanceMode({ declinedAuto: true })
    state.close(toast.key)
  }

  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <VStack
        justify="start"
        alignItems="self-start"
        {...contentProps}
        maxWidth="370px"
        gap="0.75rem"
        padding={14}
      >
        <Text
          margin={false}
          className={css({
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            whiteSpace: 'normal',
          })}
        >
          {t('message')}
        </Text>
        <Button
          size="sm"
          variant="text"
          className={css({
            color: 'primary.300',
          })}
          onPress={() => handleKeepQuality()}
        >
          {t('keepQuality')}
        </Button>
      </VStack>
    </StyledToastContainer>
  )
}
