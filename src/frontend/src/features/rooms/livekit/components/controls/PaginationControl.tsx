import * as React from 'react'
import { createInteractingObservable } from '@livekit/components-core'
import { usePagination } from '@livekit/components-react'
import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
import { Button } from '@/primitives'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'

export interface PaginationControlProps
  extends Pick<
    ReturnType<typeof usePagination>,
    'totalPageCount' | 'nextPage' | 'prevPage' | 'currentPage'
  > {
  /** Reference to an HTML element that holds the pages, while interacting (`mouseover`)
   *  with it, the pagination controls will appear for a while. */
  pagesContainer?: React.RefObject<HTMLElement>
}

export function PaginationControl({
  totalPageCount,
  nextPage,
  prevPage,
  currentPage,
  pagesContainer: connectedElement,
}: PaginationControlProps) {
  const { t } = useTranslation('rooms', { keyPrefix: 'pagination' })
  const [interactive, setInteractive] = useState(false)

  useEffect(() => {
    let subscription:
      | ReturnType<ReturnType<typeof createInteractingObservable>['subscribe']>
      | undefined
    if (connectedElement) {
      subscription = createInteractingObservable(
        connectedElement.current,
        2000
      ).subscribe(setInteractive)
    }
    return () => {
      if (subscription) {
        subscription.unsubscribe()
      }
    }
  }, [connectedElement])

  if (totalPageCount <= 1) return null

  return (
    <div
      className={css({
        position: 'absolute',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        alignItems: 'stretch',
        backgroundColor: 'var(--lk-control-bg)',
        borderRadius: 'var(--lk-border-radius)',
        transition: 'opacity ease-in-out .15s',
        display: 'none',
        border: '1px solid',
        borderColor: 'primaryDark.100',
        overflow: 'hidden',
      })}
      style={{
        display: interactive ? 'flex' : 'none',
      }}
      data-lk-user-interaction={interactive}
    >
      <Button
        isDisabled={currentPage == 1}
        onPress={prevPage}
        size="xs"
        variant="quaternaryText"
        aria-label={t('previous')}
      >
        <RiArrowLeftSLine />
      </Button>
      <span
        aria-live="polite"
        className={css({
          padding: '0.25rem 0.5rem',
        })}
      >
        {t('count', {
          currentPage,
          totalPageCount,
        })}
      </span>
      <Button
        isDisabled={currentPage == totalPageCount}
        onPress={nextPage}
        size="xs"
        variant="quaternaryText"
        aria-label={t('next')}
      >
        <RiArrowRightSLine />
      </Button>
    </div>
  )
}
