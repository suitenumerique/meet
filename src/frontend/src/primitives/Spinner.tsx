import { ProgressBar } from 'react-aria-components'
import { css, cx } from '@/styled-system/css'

const rotatingArcClassName = css({
  animation: 'rotate 1s ease-in-out infinite',
  transformOrigin: 'center',
  transition: 'transform 16ms linear',
})

export const Spinner = ({
  size = 56,
  variant = 'light',
}: {
  size?: number
  variant?: 'light' | 'dark'
}) => {
  const center = 14
  const strokeWidth = 3
  const r = 14 - strokeWidth
  const c = 2 * r * Math.PI
  return (
    <ProgressBar aria-label="Loading..." value={30}>
      {({ percentage }) => (
        <div
          className={css({
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 28 28"
            fill="none"
            strokeWidth={strokeWidth}
            className={css({
              '@media (prefers-reduced-motion: reduce)': {
                display: 'none',
              },
            })}
          >
            <circle
              cx={center}
              cy={center}
              r={r}
              strokeDasharray={0}
              strokeDashoffset={0}
              strokeLinecap="round"
              className={css({
                stroke: variant == 'light' ? 'primary.100' : 'transparent',
              })}
            />
            <circle
              cx={center}
              cy={center}
              r={r}
              strokeDasharray={`${c} ${c}`}
              strokeDashoffset={
                typeof percentage === 'number'
                  ? c - (percentage / 100) * c
                  : undefined
              }
              strokeLinecap="round"
              className={cx(
                rotatingArcClassName,
                css({
                  stroke: variant == 'light' ? 'primary.800' : 'white',
                })
              )}
            />
          </svg>
          <span
            aria-hidden="true"
            className={css({
              display: 'none',
              color: variant == 'light' ? 'primary.800' : 'white',
              fontSize: 'sm',
              '@media (prefers-reduced-motion: reduce)': {
                display: 'inline',
              },
            })}
          >
            ⏳
          </span>
        </div>
      )}
    </ProgressBar>
  )
}
