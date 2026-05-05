import { type ReactNode } from 'react'
import { css } from '@/styled-system/css'
import { Header } from './Header'
import { layoutStore } from '@/stores/layout'
import { useSnapshot } from 'valtio'
import { Footer } from '@/layout/Footer'
import { ScreenReaderAnnouncer } from '@/primitives'
import { SkipLink, MAIN_CONTENT_ID } from './SkipLink'

export type Layout = 'fullpage' | 'centered'

/**
 * Layout component for the app.
 *
 * This component is meant to be used as a wrapper around the whole app.
 * In a specific page, use the `Screen` component and change its props to change global page layout.
 */
export const Layout = ({ children }: { children: ReactNode }) => {
  const layoutSnap = useSnapshot(layoutStore)
  const showHeader = layoutSnap.showHeader
  const showFooter = layoutSnap.showFooter

  return (
    <>
      {showHeader && <SkipLink />}
      <div
        className={css({
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'white',
          color: 'default.text',
          flex: '1',
        })}
        style={{
          height: !showFooter ? '100%' : undefined,
        }}
      >
        {showHeader && <Header />}
        <main
          id={MAIN_CONTENT_ID}
          className={css({
            flexGrow: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          })}
        >
          <ScreenReaderAnnouncer />
          {children}
        </main>
      </div>
      {showFooter && <Footer />}
    </>
  )
}
