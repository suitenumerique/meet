import { type ReactNode } from 'react'
import {
  OverlayArrow,
  Tooltip as RACTooltip,
  TooltipTrigger,
  type TooltipProps,
} from 'react-aria-components'
import { styled } from '@/styled-system/jsx'
import { useOverlayPortalContainer } from './useOverlayPortalContainer'
import { VisualOnlyTooltip } from './VisualOnlyTooltip'

export type TooltipWrapperProps = {
  tooltip?: string
  tooltipType?: 'instant' | 'delayed'
}

const INSTANT_TOOLTIP_DELAY_MS = 150
const DELAYED_TOOLTIP_DELAY_MS = 1000

/**
 * Wrap a component you want to apply a tooltip on (for example a Button)
 *
 * If no tooltip is given, just returns children
 */
export const TooltipWrapper = ({
  tooltip,
  tooltipType,
  children,
}: {
  children: ReactNode
} & TooltipWrapperProps) => {
  const portalContainer = useOverlayPortalContainer()
  const isExternalDocument =
    portalContainer && portalContainer.ownerDocument !== document

  return tooltip ? (
    isExternalDocument ? (
      <VisualOnlyTooltip tooltip={tooltip}>{children}</VisualOnlyTooltip>
    ) : (
      <TooltipTrigger
        delay={
          tooltipType === 'instant'
            ? INSTANT_TOOLTIP_DELAY_MS
            : DELAYED_TOOLTIP_DELAY_MS
        }
      >
        {children}
        <Tooltip>{tooltip}</Tooltip>
      </TooltipTrigger>
    )
  ) : (
    children
  )
}

/**
 * Styled react aria Tooltip component.
 *
 * Style taken from example at https://react-spectrum.adobe.com/react-aria/Tooltip.html
 */
const StyledTooltip = styled(RACTooltip, {
  base: {
    boxShadow: '0 8px 20px rgba(0 0 0 / 0.1)',
    borderRadius: '4px',
    backgroundColor: 'primaryDark.100',
    color: 'gray.100',
    forcedColorAdjust: 'none',
    outline: 'none',
    padding: '2px 8px',
    maxWidth: '200px',
    textAlign: 'center',
    fontSize: 14,
    transform: 'translate3d(0, 0, 0)',
    '&[data-placement=top]': {
      marginBottom: '2px',
      '--origin': 'translateY(4px)',
    },
    '&[data-placement=bottom]': {
      marginTop: '2px',
      '--origin': 'translateY(-4px)',
    },
    '&[data-placement=right]': {
      marginLeft: '8px',
      '--origin': 'translateX(-4px)',
    },
    '&[data-placement=left]': {
      marginRight: '8px',
      '--origin': 'translateX(4px)',
    },
    '& .react-aria-OverlayArrow svg': {
      display: 'block',
      fill: 'var(--highlight-background)',
    },
    '&[data-entering]': { animation: 'slide 200ms' },
    '&[data-exiting]': { animation: 'slide 200ms reverse ease-in' },
  },
})

const StyledOverlayArrow = styled(OverlayArrow, {
  base: {
    '& svg': {
      display: 'block',
      fill: 'gray.800',
    },
    '&[data-placement=bottom] svg': {
      transform: 'rotate(180deg)',
    },
    '&[data-placement=right] svg': {
      transform: 'rotate(90deg)',
    },
    '&[data-placement=left] svg': {
      transform: 'rotate(-90deg)',
    },
  },
})

const TooltipArrow = () => {
  return (
    <StyledOverlayArrow>
      <svg width={8} height={8} viewBox="0 0 8 8">
        <path d="M0 0 L4 4 L8 0" />
      </svg>
    </StyledOverlayArrow>
  )
}

const Tooltip = ({
  children,
  ...props
}: Omit<TooltipProps, 'children'> & { children: ReactNode }) => {
  return (
    <StyledTooltip {...props}>
      <TooltipArrow />
      {children}
    </StyledTooltip>
  )
}
