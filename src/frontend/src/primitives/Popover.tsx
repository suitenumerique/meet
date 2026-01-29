import type { RefObject } from 'react'
import { ReactNode, useEffect, useRef, useState } from 'react'
import {
  DialogProps,
  DialogTrigger,
  Popover as RACPopover,
  Dialog,
  OverlayArrow,
} from 'react-aria-components'
import { styled } from '@/styled-system/jsx'
import { Box } from './Box'

export const StyledPopover = styled(RACPopover, {
  base: {
    minWidth: 'var(--trigger-width)',
    '&[data-entering]': {
      animation: 'slide 200ms',
    },
    '&[data-exiting]': {
      animation: 'slide 200ms reverse ease-in',
    },
    '&[data-placement="bottom"]': {
      marginTop: 0.25,
    },
    '&[data-placement=top]': {
      '--origin': 'translateY(8px)',
    },
    '&[data-placement=bottom]': {
      '--origin': 'translateY(-8px)',
    },
    '&[data-placement=right]': {
      '--origin': 'translateX(-8px)',
    },
    '&[data-placement=left]': {
      '--origin': 'translateX(8px)',
    },
  },
})

const StyledOverlayArrow = styled(OverlayArrow, {
  base: {
    display: 'block',
    fill: 'box.bg',
    stroke: 'box.border',
    strokeWidth: 1,
    '&[data-placement="bottom"] svg': {
      transform: 'rotate(180deg) translateY(-1px)',
    },
  },
  variants: {
    variant: {
      light: {},
      dark: {
        fill: 'primaryDark.50',
        stroke: 'primaryDark.50',
      },
    },
  },
  defaultVariants: {
    variant: 'light',
  },
})

type FocusOnOpenOptions = {
  selector: string
  delayMs?: number
  preventScroll?: boolean
}

type FocusOnCloseOptions = {
  ref?: RefObject<HTMLElement>
  selector?: string
  delayMs?: number
  preventScroll?: boolean
}

const scheduleFocus = (
  target: HTMLElement,
  { delayMs = 0, preventScroll = true }: { delayMs?: number; preventScroll?: boolean }
) => {
  const timer = setTimeout(() => {
    requestAnimationFrame(() => {
      target.focus({ preventScroll })
    })
  }, delayMs)
  return () => clearTimeout(timer)
}

const resolveFocusTarget = (options: FocusOnCloseOptions) => {
  if (options.ref?.current) return options.ref.current
  if (!options.selector) return null
  return document.querySelector<HTMLElement>(options.selector)
}

/**
 * a Popover is a tuple of a trigger component (most usually a Button) that toggles some content in a tooltip around the trigger
 *
 * Note: to show a list of actionable items, like a dropdown menu, prefer using a <Menu> or <Select>.
 * This is here when needing to show unrestricted content in a box.
 */
export const Popover = ({
  children,
  variant = 'light',
  withArrow = true,
  isOpen,
  defaultOpen,
  onOpenChange,
  focusOnOpen,
  focusOnClose,
  ...dialogProps
}: {
  children: [
    trigger: ReactNode,
    popoverContent:
      | (({ close }: { close: () => void }) => ReactNode)
      | ReactNode,
  ]
  variant?: 'dark' | 'light'
  withArrow?: boolean
  isOpen?: boolean
  defaultOpen?: boolean
  onOpenChange?: (isOpen: boolean) => void
  focusOnOpen?: FocusOnOpenOptions
  focusOnClose?: FocusOnCloseOptions
} & Omit<DialogProps, 'children'>) => {
  const [trigger, popoverContent] = children
  const popoverContentRef = useRef<HTMLDivElement>(null)
  const isControlled = isOpen !== undefined
  const [internalOpen, setInternalOpen] = useState(!!defaultOpen)
  const effectiveOpen = isControlled ? isOpen : internalOpen
  const prevOpenRef = useRef(effectiveOpen)

  const handleOpenChange = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen)
    }
    onOpenChange?.(nextOpen)
  }

  useEffect(() => {
    if (!effectiveOpen || !focusOnOpen) return
    const first = popoverContentRef.current?.querySelector<HTMLElement>(
      focusOnOpen.selector
    )
    if (!first) return
    return scheduleFocus(first, focusOnOpen)
  }, [effectiveOpen, focusOnOpen])

  useEffect(() => {
    const wasOpen = prevOpenRef.current
    let cleanup: (() => void) | undefined
    if (wasOpen && !effectiveOpen && focusOnClose) {
      const target = resolveFocusTarget(focusOnClose)
      if (target) cleanup = scheduleFocus(target, focusOnClose)
    }
    prevOpenRef.current = effectiveOpen
    return cleanup
  }, [effectiveOpen, focusOnClose])
  return (
    <DialogTrigger
      isOpen={effectiveOpen}
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
    >
      {trigger}
      <StyledPopover>
        {withArrow && (
          <StyledOverlayArrow variant={variant}>
            <svg width={12} height={12} viewBox="0 0 12 12">
              <path d="M0 0 L6 6 L12 0" />
            </svg>
          </StyledOverlayArrow>
        )}
        <Dialog {...dialogProps}>
          {({ close }) => (
            <Box
              size="sm"
              type="popover"
              variant={variant}
              ref={popoverContentRef}
            >
              {typeof popoverContent === 'function'
                ? popoverContent({ close })
                : popoverContent}
            </Box>
          )}
        </Dialog>
      </StyledPopover>
    </DialogTrigger>
  )
}
