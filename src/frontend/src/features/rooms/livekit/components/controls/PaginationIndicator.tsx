import * as React from 'react'

export interface PaginationIndicatorProps {
  totalPageCount: number
  currentPage: number
}

export const PaginationIndicator: (
  props: PaginationIndicatorProps & React.RefAttributes<HTMLDivElement>
) => React.ReactNode = /* @__PURE__ */ React.forwardRef<
  HTMLDivElement,
  PaginationIndicatorProps
>(function PaginationIndicator(
  { totalPageCount, currentPage }: PaginationIndicatorProps,
  ref
) {
  const bubbles = new Array(totalPageCount).fill('').map((_, index) => {
    if (index + 1 === currentPage) {
      return <span data-lk-active key={index} />
    } else {
      return <span key={index} />
    }
  })

  return (
    <div ref={ref} className="lk-pagination-indicator">
      {bubbles}
    </div>
  )
})
