import { type ReactNode } from 'react'
import { Heading } from 'react-aria-components'
import { css, cx } from '@/styled-system/css'
import { Button, type ButtonProps } from './Button'

/**
 * Parts of a small modal of the UI kit, to lay out the content of a Dialog:
 *
 *   <Dialog isOpen={isOpen} role="alertdialog" type="alert">
 *     <DialogTitle>Mute Camille</DialogTitle>
 *     <DialogBody>Only Camille will be able to unmute.</DialogBody>
 *     <DialogActions>
 *       <DialogDismissButton onPress={cancel}>Cancel</DialogDismissButton>
 *       <Button variant="primary" size="sm" onPress={mute}>Mute</Button>
 *     </DialogActions>
 *   </Dialog>
 */

/**
 * Title of the dialog, which also names it for assistive technologies. Do
 * not pass the `title` prop of the Dialog with it.
 */
export const DialogTitle = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => (
  <Heading
    slot="title"
    level={1}
    className={cx(
      css({
        fontSize: '1.125rem',
        fontWeight: 'bold',
        lineHeight: '1.5rem',
        marginBottom: '0.375rem',
      }),
      className
    )}
  >
    {children}
  </Heading>
)

/**
 * Text of the dialog: paragraphs and lists, in the secondary color.
 */
export const DialogBody = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => (
  <div
    className={cx(
      css({
        color: 'content.semantic.neutral.secondary',
        fontSize: 'sm',
        lineHeight: '1.25rem',
        textWrap: 'pretty',
        '& p': {
          margin: 0,
          padding: 0,
        },
        '& > * + *': {
          marginTop: '0.5rem',
        },
        '& ul': {
          listStyle: 'disc',
          paddingLeft: '1.25rem',
        },
        '& ol': {
          listStyle: 'decimal',
          paddingLeft: '1.25rem',
        },
        '& li + li': {
          marginTop: '0.25rem',
        },
      }),
      className
    )}
  >
    {children}
  </div>
)

/**
 * Actions of the dialog, on the right: the main one goes last.
 */
export const DialogActions = ({ children }: { children: ReactNode }) => (
  <div
    className={css({
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: '0.5rem',
      marginTop: '1.5rem',
    })}
  >
    {children}
  </div>
)

/**
 * Secondary action of a dialog, such as cancelling: neutral, so the main
 * action is the one which stands out.
 */
export const DialogDismissButton = ({ className, ...props }: ButtonProps) => (
  <Button
    variant="bordered"
    size="sm"
    className={cx(
      css({ color: 'content.semantic.neutral.secondary!' }),
      typeof className === 'string' ? className : undefined
    )}
    {...props}
  />
)
