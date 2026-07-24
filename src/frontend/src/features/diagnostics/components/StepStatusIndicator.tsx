import { css, cx } from '@/styled-system/css'
import type { ConnectionTestStepStatus } from '../types'
import { statusSquareClass, statusTextClass } from './stepAppearance'

const wrapperClass = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  textStyle: 'sm',
  whiteSpace: 'nowrap',
})

const squareClass = css({
  width: '0.625rem',
  height: '0.625rem',
  borderRadius: '2px',
  flexShrink: 0,
})

/**
 * Status is carried by the label; the square is decorative so the meaning does
 * not depend on colour alone.
 */
export const StepStatusIndicator = ({
  status,
  label,
  className,
}: {
  status: ConnectionTestStepStatus
  label: string
  className?: string
}) => (
  <span className={cx(wrapperClass, className)}>
    <span
      aria-hidden="true"
      className={cx(squareClass, statusSquareClass[status])}
    />
    <span className={statusTextClass[status]}>{label}</span>
  </span>
)
