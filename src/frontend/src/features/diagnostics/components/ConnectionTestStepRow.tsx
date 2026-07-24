import { useTranslation } from 'react-i18next'
import {
  Disclosure,
  DisclosurePanel,
  Heading,
  Button as RACButton,
} from 'react-aria-components'
import { RiArrowDownSFill } from '@remixicon/react'
import { css, cx } from '@/styled-system/css'
import type { ConnectionTestStepResult } from '../types'
import { StepStatusIndicator } from './StepStatusIndicator'

/** Each step is its own bounded card, collapsed or not. */
const cardClass = css({
  border: '1px solid {colors.greyscale.900}',
  borderRadius: '5px',
  backgroundColor: 'white',
  overflow: 'hidden',
})

/**
 * Fixed columns so the status labels line up across every row, whether or not
 * the row is expandable.
 */
const rowClass = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 7rem 1.5rem',
  alignItems: 'center',
  gap: '1rem',
  width: '100%',
  paddingX: '1rem',
  paddingY: '0.75rem',
  textAlign: 'left',
})

const identityClass = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.125rem',
  minWidth: 0,
})

const triggerClass = css({
  cursor: 'pointer',
  transition: 'background-color 120ms',
  _hover: { backgroundColor: 'greyscale.50' },
  '&[data-focus-visible]': {
    outline: '2px solid {colors.focusRing}',
    outlineOffset: '-2px',
  },
})

/** Expanded headers stay tinted so the open card reads as one block. */
const triggerExpandedClass = css({
  backgroundColor: 'greyscale.100',
  _hover: { backgroundColor: 'greyscale.100' },
})

const labelClass = css({
  textStyle: 'body',
  color: 'greyscale.1000',
  fontWeight: 'medium',
})

const valueClass = css({
  fontFamily: 'mono',
  textStyle: 'xs',
  color: 'greyscale.500',
  overflowWrap: 'anywhere',
})

const chevronClass = css({
  color: 'primary.800',
  justifySelf: 'end',
  transition: 'transform 150ms',
})

const chevronExpandedClass = css({ transform: 'rotate(180deg)' })

const headingResetClass = css({
  margin: 0,
  fontSize: 'inherit',
  fontWeight: 'inherit',
})

const panelClass = css({
  backgroundColor: 'white',
})

const logListClass = css({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
})

const logItemClass = css({
  fontFamily: 'mono',
  textStyle: 'xs',
  color: 'greyscale.700',
  overflowWrap: 'anywhere',
})

const StepRowContent = ({ step }: { step: ConnectionTestStepResult }) => {
  const { t } = useTranslation('connectionTest')

  return (
    <>
      <span className={identityClass}>
        <span className={labelClass}>{t(`steps.${step.id}`)}</span>
        {step.summary && <span className={valueClass}>{step.summary}</span>}
      </span>
      <StepStatusIndicator
        status={step.status}
        label={t(`status.${step.status}`)}
      />
    </>
  )
}

export const ConnectionTestStepRow = ({
  step,
}: {
  step: ConnectionTestStepResult
}) => {
  const { t } = useTranslation('connectionTest')
  const isSettled = step.status !== 'pending' && step.status !== 'running'
  const hasLogs = isSettled && Boolean(step.logs?.length)

  if (!hasLogs) {
    return (
      <div className={cx(cardClass, rowClass)}>
        <StepRowContent step={step} />
        {/* Empty chevron column keeps non-expandable rows aligned. */}
        <span />
      </div>
    )
  }

  return (
    <Disclosure className={cardClass}>
      {({ isExpanded }) => (
        <>
          <Heading level={3} className={headingResetClass}>
            <RACButton
              slot="trigger"
              className={cx(
                rowClass,
                triggerClass,
                isExpanded ? triggerExpandedClass : undefined
              )}
            >
              <StepRowContent step={step} />
              <RiArrowDownSFill
                aria-hidden="true"
                className={cx(
                  chevronClass,
                  isExpanded ? chevronExpandedClass : undefined
                )}
              />
            </RACButton>
          </Heading>
          <DisclosurePanel
            className={panelClass}
            aria-label={t('detailsFor', { step: t(`steps.${step.id}`) })}
            style={{ padding: isExpanded ? '0.75rem 1rem' : '0  1rem' }}
          >
            {/* Collapsed panels stay in the DOM for aria-controls, but the log
                lines themselves are only mounted when actually visible. */}
            {isExpanded && (
              <ul className={logListClass}>
                {step.logs?.map((log, index) => (
                  <li key={`${log.level}-${index}`} className={logItemClass}>
                    {log.message}
                  </li>
                ))}
              </ul>
            )}
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  )
}
