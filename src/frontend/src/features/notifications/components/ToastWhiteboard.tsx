import { useToast } from 'react-aria'
import { useRef } from 'react'
import { RiArtboardLine, RiCloseLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import type { ToastProps } from './Toast'
import { HStack } from '@/styled-system/jsx'
import { Button, Div } from '@/primitives'
import { css } from '@/styled-system/css'
import { StyledToastContainer } from './StyledToastContainer'
import { NotificationType } from '../NotificationType'
import { useWhiteboard } from '@/features/whiteboard'

export function ToastWhiteboard({ state, ...props }: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications')
  const ref = useRef(null)
  const { toastProps, contentProps, titleProps, closeButtonProps } = useToast(
    props,
    state,
    ref
  )
  const { isOpen, openWhiteboard } = useWhiteboard()
  const content = props.toast.content
  const type = content.type
  const name =
    content.sharerName || content.participant?.name || t('defaultName')

  const isStarted = type === NotificationType.WhiteboardStarted

  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <HStack
        justify="center"
        alignItems="center"
        {...contentProps}
        padding={14}
        gap={0}
      >
        <RiArtboardLine
          color="white"
          size={20}
          style={{
            marginRight: '0.75rem',
            flexShrink: 0,
          }}
        />
        <Div {...titleProps} marginRight={0.5}>
          {isStarted
            ? t('whiteboard.started', { name })
            : t('whiteboard.stopped', { name })}
        </Div>
        {isStarted && !isOpen && (
          <Button
            size="sm"
            variant="text"
            className={css({
              color: 'primary.300',
              marginLeft: '0.5rem',
            })}
            onPress={(e) => {
              openWhiteboard(false)
              closeButtonProps.onPress?.(e)
            }}
          >
            {t('whiteboard.cta')}
          </Button>
        )}
        <Button square size="sm" invisible {...closeButtonProps}>
          <RiCloseLine size={18} color="white" />
        </Button>
      </HStack>
    </StyledToastContainer>
  )
}
