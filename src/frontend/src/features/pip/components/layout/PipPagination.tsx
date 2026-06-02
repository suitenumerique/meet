import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { styled } from '@/styled-system/jsx'

interface PipPaginationProps {
  totalPageCount: number
  currentPage: number
  nextPage: () => void
  prevPage: () => void
}

export const PipPagination = ({
  totalPageCount,
  currentPage,
  nextPage,
  prevPage,
}: PipPaginationProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'pagination' })

  if (totalPageCount <= 1) return null

  return (
    <Nav aria-label={t('label')}>
      <ArrowButton
        type="button"
        onClick={prevPage}
        disabled={currentPage === 1}
        aria-label={t('previous')}
      >
        <RiArrowLeftSLine size={18} />
      </ArrowButton>
      <Counter role="status">
        {t('count', { currentPage, totalPageCount })}
      </Counter>
      <ArrowButton
        type="button"
        onClick={nextPage}
        disabled={currentPage === totalPageCount}
        aria-label={t('next')}
      >
        <RiArrowRightSLine size={18} />
      </ArrowButton>
    </Nav>
  )
}

const Nav = styled('nav', {
  base: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.25rem',
    marginTop: '1rem',
    flexShrink: 0,
  },
})

const ArrowButton = styled('button', {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1.75rem',
    height: '1.75rem',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    color: 'white',
    backgroundColor: 'primaryDark.100',
    transition: 'opacity 0.15s, background-color 0.15s',
    '&:hover:not(:disabled)': {
      backgroundColor: 'primaryDark.75',
    },
    '&:focus-visible': {
      outline: '2px solid',
      outlineColor: 'white',
      outlineOffset: '2px',
    },
    '&:disabled': {
      opacity: 0.3,
      cursor: 'default',
    },
  },
})

const Counter = styled('span', {
  base: {
    fontSize: '0.75rem',
    color: 'white',
    opacity: 0.8,
    whiteSpace: 'nowrap',
    padding: '0 0.25rem',
    minWidth: '3rem',
    textAlign: 'center',
  },
})
