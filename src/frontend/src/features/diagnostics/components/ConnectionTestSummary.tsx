import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ProgressBar } from 'react-aria-components'
import { css, cx } from '@/styled-system/css'
import { A } from '@/primitives'
import type { ConnectionTestStats } from '../types'
import { statusSquareClass } from './stepAppearance'

/**
 * Network prerequisites (protocols, ports, TURN fallbacks), written for the
 * reader's IT department rather than for the end user.
 */
const NETWORK_REQUIREMENTS_DOC_URL =
  'https://docs.numerique.gouv.fr/docs/f2baa1b9-f29e-4d58-959d-65d4376fc6b8/'

type SummaryState =
  | 'idle'
  | 'running'
  | 'passed'
  | 'partial'
  | 'failed'
  | 'warning'

/** Only a failure or a degraded route earns a colour: everything else stays near-black. */
const stateColorClass: Record<SummaryState, string> = {
  idle: css({ color: 'greyscale.1000' }),
  running: css({ color: 'greyscale.1000' }),
  passed: css({ color: 'greyscale.1000' }),
  partial: css({ color: 'greyscale.1000' }),
  failed: css({ color: 'danger.600' }),
  warning: css({ color: 'warning' }),
}

const cardClass = css({
  width: '100%',
  borderRadius: '5px',
  border: '1px solid {colors.greyscale.900}',
  backgroundColor: 'white',
  padding: { base: '1.25rem', xsm: '1.75rem' },
  display: 'flex',
  flexDirection: 'column',
  // Blocks are spaced here; everything inside a block stays tight.
  gap: '1.5rem',
})

const headerClass = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
})

const eyebrowClass = css({
  textStyle: 'sm',
  fontWeight: 'medium',
  color: 'greyscale.600',
  margin: 0,
})

const headlineClass = css({
  // Sized for the longest state string ("N vérifications en échec"), not for
  // the shortest one.
  fontSize: { base: '28', xsm: '40' },
  lineHeight: '1.1',
  fontWeight: 'bold',
  letterSpacing: '-0.02em',
  textWrap: 'balance',
  margin: 0,
})

const hintClass = css({
  textStyle: 'sm',
  color: 'greyscale.600',
  margin: 0,
  maxWidth: '34rem',
})

const dividerClass = css({
  // Lighter than the card border: an inner rule should never compete with it.
  borderTop: '1px solid {colors.greyscale.100}',
  paddingTop: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.875rem',
})

const progressRowClass = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
})

const trackClass = css({
  height: '0.375rem',
  width: '100%',
  borderRadius: 'full',
  backgroundColor: 'greyscale.200',
  overflow: 'hidden',
})

const fillClass = css({
  height: '100%',
  borderRadius: 'full',
  backgroundColor: 'primary.800',
  transition: 'width 200ms ease-out',
})

const progressValueClass = css({
  textStyle: 'sm',
  fontVariantNumeric: 'tabular-nums',
  color: 'greyscale.700',
  whiteSpace: 'nowrap',
  // Reserved width so the bar does not resize when the digits change.
  minWidth: '3rem',
  textAlign: 'right',
})

const countersClass = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem 1.5rem',
})

const counterClass = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  textStyle: 'sm',
  color: 'greyscale.600',
})

const counterSquareClass = css({
  width: '0.5rem',
  height: '0.5rem',
  borderRadius: '2px',
  flexShrink: 0,
})

const counterValueClass = css({
  fontWeight: 'medium',
  fontVariantNumeric: 'tabular-nums',
  color: 'greyscale.1000',
})

/** A zero count is context, not a result: it recedes instead of shouting. */
const emptyCounterClass = css({ color: 'greyscale.400' })
const emptySquareClass = css({
  backgroundColor: 'transparent!',
  border: '1px solid {colors.greyscale.250}',
})

const actionsClass = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.75rem',
})

const Counter = ({
  squareClass,
  value,
  label,
}: {
  squareClass: string
  value: number
  label: string
}) => {
  const isEmpty = value === 0

  return (
    <span className={cx(counterClass, isEmpty ? emptyCounterClass : undefined)}>
      <span
        aria-hidden="true"
        className={cx(
          counterSquareClass,
          squareClass,
          isEmpty ? emptySquareClass : undefined
        )}
      />
      <span
        className={cx(
          counterValueClass,
          isEmpty ? emptyCounterClass : undefined
        )}
      >
        {value}
      </span>
      {label}
    </span>
  )
}

export const ConnectionTestSummary = ({
  stats,
  isRunning,
  routeWarning = false,
  children,
}: {
  stats: ConnectionTestStats
  isRunning: boolean
  /** The selected ICE route is usable but not UDP (e.g. TURN over TCP/TLS). */
  routeWarning?: boolean
  children?: ReactNode
}) => {
  const { t } = useTranslation('connectionTest')

  // A hard failure still outranks the route warning; the warning outranks
  // 'partial' because a measured degraded route matters more than skipped
  // camera or microphone checks.
  const state: SummaryState = isRunning
    ? 'running'
    : !stats.hasStarted
      ? 'idle'
      : stats.failed > 0
        ? 'failed'
        : routeWarning
          ? 'warning'
          : stats.skipped > 0
            ? 'partial'
            : 'passed'

  return (
    <section className={cardClass}>
      <div className={headerClass}>
        <h1 className={eyebrowClass}>{t('title')}</h1>

        {/* Announced once per state change rather than on every step update. */}
        <p className={cx(headlineClass, stateColorClass[state])} role="status">
          {state === 'failed'
            ? t('summary.failed', { count: stats.failed })
            : t(`summary.${state}`)}
        </p>

        <p className={hintClass}>
          {t(`summary.${state}Hint`)}
          {state === 'warning' && (
            <>
              {' '}
              <A
                href={NETWORK_REQUIREMENTS_DOC_URL}
                target="_blank"
                rel="noreferrer"
                size="sm"
              >
                {t('summary.warningDocLink')}
              </A>
            </>
          )}
        </p>
      </div>

      {stats.hasStarted && (
        <div className={dividerClass}>
          <div className={progressRowClass}>
            <ProgressBar
              aria-label={t('progressLabel')}
              value={stats.progress}
              className={css({ flex: 1 })}
            >
              {({ percentage }) => (
                <div className={trackClass}>
                  <div
                    className={fillClass}
                    style={{ width: `${percentage ?? 0}%` }}
                  />
                </div>
              )}
            </ProgressBar>
            <span className={progressValueClass}>
              {t('progress', { done: stats.settled, total: stats.total })}
            </span>
          </div>

          <div className={countersClass}>
            <Counter
              squareClass={statusSquareClass.success}
              value={stats.passed}
              label={t('counts.passed')}
            />
            <Counter
              squareClass={statusSquareClass.skipped}
              value={stats.skipped}
              label={t('counts.skipped')}
            />
            <Counter
              squareClass={statusSquareClass.failed}
              value={stats.failed}
              label={t('counts.failed')}
            />
          </div>
        </div>
      )}

      {children && <div className={actionsClass}>{children}</div>}
    </section>
  )
}
