import {
  forwardRef,
  type ComponentProps,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { Button as RACButton } from 'react-aria-components'
import { RiCloseLine } from '@remixicon/react'
import { css, cva, cx, type RecipeVariantProps } from '@/styled-system/css'

/**
 * A notification, laid out as the toast of the UI kit:
 *
 *   [media] [icon] [title]                [actions] [close]
 *                  message
 *
 * Notifications share one surface. Only the ones reporting a problem stand
 * out, with the `warning` and `error` palettes of the UI kit. The room is
 * dark, so are its notifications: the palettes resolve to their dark values
 * through `data-theme`.
 */
const toastCard = cva({
  base: {
    // position in the stack of notifications
    margin: 'xs',
    marginLeft: 'auto',
    // one width for every notification
    width: 'min(26rem, calc(100vw - 2rem))',
    '&[data-entering]': { animation: 'fade 200ms' },
    '&[data-exiting]': { animation: 'fade 150ms reverse ease-in' },
    // the toast of the UI kit
    display: 'flex',
    alignItems: 'stretch',
    boxSizing: 'border-box',
    minHeight: '48px',
    overflow: 'hidden',
    border: '1px solid',
    borderRadius: '8px',
    boxShadow: '0 6px 18px 0 rgba(0, 0, 0, 0.3)',
    fontSize: 'sm',
    fontWeight: 'medium',
    lineHeight: '1.125rem',
    color: 'var(--toast-ink)',
  },
  variants: {
    variant: {
      neutral: {
        backgroundColor: 'background.semantic.neutral.tertiary',
        borderColor: 'border.semantic.neutral.tertiary',
        '--toast-ink': '{colors.content.semantic.neutral.primary}',
        '--toast-action': '{colors.content.semantic.neutral.tertiary}',
        '--toast-action-hover':
          '{colors.background.semantic.neutral.secondary}',
      },
      warning: {
        backgroundColor: 'background.semantic.warning.tertiary',
        borderColor: 'border.semantic.warning.tertiary',
        '--toast-ink': '{colors.content.semantic.warning.primary}',
        '--toast-action': '{colors.content.semantic.warning.tertiary}',
        '--toast-action-hover':
          '{colors.background.semantic.warning.secondary}',
      },
      error: {
        backgroundColor: 'background.semantic.error.tertiary',
        borderColor: 'border.semantic.error.tertiary',
        '--toast-ink': '{colors.content.semantic.error.primary}',
        '--toast-action': '{colors.content.semantic.error.tertiary}',
        '--toast-action-hover': '{colors.background.semantic.error.secondary}',
      },
    },
  },
  defaultVariants: {
    variant: 'neutral',
  },
})

export type ToastVariant = NonNullable<
  RecipeVariantProps<typeof toastCard>
>['variant']

const body = css({
  flex: '1 1 auto',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px',
  textAlign: 'start',
  color: 'inherit',
  font: 'inherit',
})

const iconSlot = css({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '24px',
  height: '24px',
  '& svg': {
    width: '24px',
    height: '24px',
  },
})

const content = css({
  flex: '1 1 auto',
  minWidth: 0,
  paddingInline: '4px',
  overflowWrap: 'anywhere',
  textWrap: 'pretty',
})

const actionButton = css({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '32px',
  minWidth: '32px',
  paddingInline: '8px',
  border: '1px solid transparent',
  borderRadius: '4px',
  background: 'transparent',
  color: 'var(--toast-action)',
  font: 'inherit',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: 'background 150ms',
  '&[data-hovered]': {
    background: 'var(--toast-action-hover)',
  },
  '&[data-focus-visible]': {
    outline: '2px solid!',
    outlineColor: 'var(--toast-action)!',
    outlineOffset: '-2px!',
  },
})

/**
 * An action of a notification: a button of its palette.
 */
export const ToastAction = ({
  className,
  ...props
}: ComponentProps<typeof RACButton>) => (
  <RACButton
    className={cx(
      actionButton,
      typeof className === 'string' ? className : undefined
    )}
    {...props}
  />
)

export type ToastCardProps = {
  variant?: ToastVariant
  /** Icon before the message, 24px. */
  icon?: ReactNode
  /** Picture taking the whole height, before the icon. */
  media?: ReactNode
  /** Who or what the notification is about, above its message. */
  title?: ReactNode
  /** The message. */
  children?: ReactNode
  /** `ToastAction` buttons, after the message. */
  actions?: ReactNode
  /** Makes the whole notification a button. Not to mix with `actions`. */
  onPress?: ComponentProps<typeof RACButton>['onPress']
  /** Name of what `onPress` does, for assistive technologies. */
  pressLabel?: string
  /** Props of `useToast`: `toastProps` go on the card itself. */
  contentProps?: HTMLAttributes<HTMLElement>
  titleProps?: HTMLAttributes<HTMLElement>
  /** Shows a close button, when given. */
  closeButtonProps?: ComponentProps<typeof RACButton>
} & Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'children'>

export const ToastCard = forwardRef<HTMLDivElement, ToastCardProps>(
  function ToastCard(
    {
      variant,
      icon,
      media,
      title,
      children,
      actions,
      onPress,
      pressLabel,
      contentProps,
      titleProps,
      closeButtonProps,
      className,
      ...toastProps
    },
    ref
  ) {
    const message = (
      <>
        {media}
        {icon && (
          <span
            className={cx(
              iconSlot,
              !!title && css({ alignSelf: 'flex-start' })
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <div className={content} {...contentProps}>
          {title && (
            <div
              className={css({ fontWeight: 'bold', lineHeight: '1.5rem' })}
              {...(children ? undefined : titleProps)}
            >
              {title}
            </div>
          )}
          {children && <div {...titleProps}>{children}</div>}
        </div>
      </>
    )

    return (
      <div
        ref={ref}
        data-theme="dark"
        className={cx(toastCard({ variant }), className)}
        {...toastProps}
      >
        {onPress ? (
          <RACButton
            className={cx(body, css({ cursor: 'pointer' }))}
            onPress={onPress}
            aria-label={pressLabel}
          >
            {message}
          </RACButton>
        ) : (
          <div className={body}>
            {message}
            {(actions || closeButtonProps) && (
              <div
                className={css({
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1px',
                  marginInlineStart: 'auto',
                })}
              >
                {actions}
                {closeButtonProps && (
                  <ToastAction
                    {...closeButtonProps}
                    className={css({ paddingInline: '0!' })}
                  >
                    <RiCloseLine size={20} aria-hidden="true" />
                  </ToastAction>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
)
