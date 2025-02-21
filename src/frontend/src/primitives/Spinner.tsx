import { ProgressBar } from 'react-aria-components'
import { css } from '@/styled-system/css'

// FIXME - this component will be style after the designer review
export const Spinner = () => {
  const center = 16
  const strokeWidth = 4
  const r = 16 - strokeWidth
  const c = 2 * r * Math.PI
  return (
    <ProgressBar aria-label="Loading…" value={75}>
      {({ percentage }) => (
        <>
          <svg
            width={64}
            height={64}
            viewBox="0 0 32 32"
            fill="none"
            strokeWidth={strokeWidth}
          >
            <circle
              cx={center}
              cy={center}
              r={r - (strokeWidth / 2 - 0.25)}
              className={css({
                stroke: 'primary.300',
                strokeWidth: 0.5,
              })}
            />
            <circle
              cx={center}
              cy={center}
              r={r + (strokeWidth / 2 - 0.25)}
              className={css({
                stroke: 'primary.300',
                strokeWidth: 0.5,
              })}
            />
            <circle
              cx={center}
              cy={center}
              r={r}
              strokeDasharray={`${c} ${c}`}
              strokeDashoffset={percentage && c - (percentage / 100) * c}
              strokeLinecap="round"
              className={css({
                stroke: 'primary.900',
              })}
              style={{
                animation: `rotate 1s linear infinite`,
                transformOrigin: 'center',
                transition: 'transform 16ms linear',
              }}
            />
          </svg>
        </>
      )}
    </ProgressBar>
  )
}
