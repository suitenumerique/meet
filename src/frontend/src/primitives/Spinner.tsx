import { ProgressBar } from 'react-aria-components'
import { css } from '@/styled-system/css'

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
              style={{}}
            />
            <circle
              cx={center}
              cy={center}
              r={r}
              strokeDasharray={`${c} ${c}`}
              strokeDashoffset={percentage && c - (percentage / 100) * c}
              strokeLinecap="round"
              className={css({
                stroke: variant == 'light' ? 'primary.800' : 'white',
              })}
              style={{
                animation: `rotate 1s ease-in-out infinite`,
                transformOrigin: 'center',
                transition: 'transform 16ms linear',
              }}
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
