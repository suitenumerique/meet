import { layoutStore } from '@/stores/layout'
import { Layout } from './Layout'
import { useEffect } from 'react'
import { Centered } from './Centered'
import { H } from '@/primitives'
import { css } from '@/styled-system/css'

export type ScreenProps = {
  /**
   * 'fullpage' by default.
   */
  layout?: Layout
  /**
   * Show header or not.
   * True by default. Pass undefined to render the screen without modifying current header visibility
   */
  header?: boolean
  footer?: boolean
  headerTitle?: string
  children: React.ReactNode
}

export const Screen = ({
  layout = 'fullpage',
  header = true,
  footer = true,
  headerTitle,
  children,
}: ScreenProps) => {
  useEffect(() => {
    if (header !== undefined) {
      layoutStore.showHeader = header
    }
    if (footer !== undefined) {
      layoutStore.showFooter = footer
    }
  }, [header, footer])

  return (
    <>
      {headerTitle && (
        <div
          className={css({
            backgroundColor: 'primary.100',
            width: '100%',
          })}
        >
          <div
            className={css({
              maxWidth: '100%',
              width: '38rem',
              margin: 'auto',
              paddingX: '2rem',
            })}
          >
            <H
              lvl={1}
              margin={false}
              className={css({
                paddingY: '2rem',
                md: {
                  paddingY: '3rem',
                },
              })}
            >
              {headerTitle}
            </H>
          </div>
        </div>
      )}
      {layout === 'centered' ? <Centered>{children}</Centered> : children}
    </>
  )
}
