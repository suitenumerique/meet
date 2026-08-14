import { useToast } from 'react-aria'
import { useRef } from 'react'
import { RiCloseLine } from '@remixicon/react'

import { type ToastProps } from './Toast'
import { HStack, VStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { StyledToastContainer } from './StyledToastContainer'
import { disablePerformanceMode } from '@/stores/performanceMode'
import { captureEvent } from '@/features/analytics/telemetry'

export function ToastCpuConstrained({ state, ...props }: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications', {
    keyPrefix: 'cpuConstrained',
  })
  const ref = useRef(null)
  const { toastProps, contentProps, closeButtonProps } = useToast(
    props,
    state,
    ref
  )
  const toast = props.toast

  const handleKeepQuality = () => {
    captureEvent('cpu-constrained-degradation-cancelled')
    disablePerformanceMode({ declinedAuto: true })
    state.close(toast.key)
  }

  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <HStack alignItems="start" gap="0.5rem" padding={14}>
        <VStack
          justify="start"
          alignItems="self-start"
          {...contentProps}
          maxWidth="370px"
          gap="0.75rem"
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
        <Button square size="sm" invisible {...closeButtonProps}>
          <RiCloseLine size={18} color="white" />
        </Button>
      </HStack>
    </StyledToastContainer>
  )
}
