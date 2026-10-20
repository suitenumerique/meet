import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
import { Button } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { css, cva, type RecipeVariantProps } from '@/styled-system/css'
import { useCallback, useRef } from 'react'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'

const paginationToolbar = cva({
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.125rem',
    backgroundColor: 'primaryDark.50',
    borderRadius: '2rem',
    border: '1px solid',
    borderColor: 'primaryDark.200',
    padding: '0.375rem',
  },
  variants: {
    placement: {
      overlay: {
        position: 'absolute',
        bottom: '1rem',
        left: '50%',
        zIndex: 2,
        transform: 'translateX(-50%)',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.45)',
      },
      inline: {
        alignSelf: 'center',
        flexShrink: 0,
        marginTop: '1rem',
      },
    },
  },
  defaultVariants: {
    placement: 'overlay',
  },
})

export type PaginationControlProps = RecipeVariantProps<
  typeof paginationToolbar
> & {
  totalPageCount: number
  nextPage: () => void
  prevPage: () => void
  currentPage: number
  // The shortcut listens on the main window only, so a single instance may own it.
  focusShortcut?: boolean
}

const arrowButtonClass = css({
  _disabled: {
    cursor: 'default',
    backgroundColor: 'transparent !important',
    '& svg': {
      opacity: 0.35,
    },
    _focusVisible: {
      outline: '2px solid',
      outlineColor: 'focusRing',
      outlineOffset: '2px',
    },
  },
})

export function PaginationControl({
  totalPageCount,
  nextPage,
  prevPage,
  currentPage,
  placement,
  focusShortcut = false,
}: PaginationControlProps) {
  const { t } = useTranslation('rooms', { keyPrefix: 'pagination' })
  const prevButtonRef = useRef<HTMLButtonElement>(null)
  const nextButtonRef = useRef<HTMLButtonElement>(null)
  const isSinglePage = totalPageCount <= 1
  const isFirstPage = currentPage <= 1
  const isLastPage = currentPage >= totalPageCount

  const focusPagination = useCallback(() => {
    const target = isLastPage ? prevButtonRef.current : nextButtonRef.current
    target?.focus()
  }, [isLastPage])

  useRegisterKeyboardShortcut({
    id: focusShortcut ? 'focus-pagination' : undefined,
    handler: focusPagination,
    isDisabled: isSinglePage,
    unregisterOnUnmount: true,
  })

  if (isSinglePage) return null

  const pageCount = t('count', { currentPage, totalPageCount })

  return (
    <div
      role="group"
      aria-label={`${t('label')}, ${pageCount}`}
      className={paginationToolbar({ placement })}
    >
      <Button
        ref={prevButtonRef}
        aria-disabled={isFirstPage}
        onPress={isFirstPage ? undefined : prevPage}
        size="sm"
        square
        variant="primaryTextDark"
        className={arrowButtonClass}
        aria-label={t('previous')}
        tooltip={t('previous')}
      >
        <RiArrowLeftSLine size={20} />
      </Button>
      <span
        role="status"
        className={css({
          color: 'white',
          fontSize: '0.8125rem',
          fontWeight: 500,
          minWidth: '3.5rem',
          textAlign: 'center',
          userSelect: 'none',
          padding: '0 0.35rem',
          whiteSpace: 'nowrap',
        })}
      >
        {pageCount}
      </span>
      <Button
        ref={nextButtonRef}
        aria-disabled={isLastPage}
        onPress={isLastPage ? undefined : nextPage}
        size="sm"
        square
        variant="primaryTextDark"
        className={arrowButtonClass}
        aria-label={t('next')}
        tooltip={t('next')}
      >
        <RiArrowRightSLine size={20} />
      </Button>
    </div>
  )
}
