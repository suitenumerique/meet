import { lazy, Suspense } from 'react'

const LazyPanel = import.meta.env.DEV
  ? lazy(() => import('./MeetDevtools'))
  : null

export const MeetDevtools = () => {
  if (!LazyPanel) return null
  return (
    <Suspense fallback={null}>
      <LazyPanel />
    </Suspense>
  )
}
