import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
import { Button } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { Toolbar } from 'react-aria-components'

export interface PaginationControlProps {
  totalPageCount: number
  nextPage: () => void
  prevPage: () => void
  currentPage: number
}

export function PaginationControl({
  totalPageCount,
  nextPage,
  prevPage,
  currentPage,
}: PaginationControlProps) {
  const { t } = useTranslation('rooms', { keyPrefix: 'pagination' })

  if (totalPageCount <= 1) return null

  return (
    <Toolbar
      aria-label={t('label')}
      className={css({
        position: 'absolute',
        bottom: '1rem',
        left: '50%',
        zIndex: 2,
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.125rem',
        backgroundColor: 'primaryDark.50',
        borderRadius: '2rem',
        border: '1px solid',
        borderColor: 'primaryDark.200',
        padding: '0.375rem',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.45)',
      })}
    >
      <Button
        isDisabled={currentPage === 1}
        onPress={prevPage}
        size="sm"
        square
        variant="primaryTextDark"
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
        {t('count', {
          currentPage,
          totalPageCount,
        })}
      </span>
      <Button
        isDisabled={currentPage === totalPageCount}
        onPress={nextPage}
        size="sm"
        square
        variant="primaryTextDark"
        aria-label={t('next')}
        tooltip={t('next')}
      >
        <RiArrowRightSLine size={20} />
      </Button>
    </Toolbar>
  )
}
