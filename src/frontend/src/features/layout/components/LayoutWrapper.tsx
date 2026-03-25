import { styled } from '@/styled-system/jsx'
import { cva } from '@/styled-system/css'

export const LayoutWrapper = styled(
  'div',
  cva({
    base: {
      position: 'relative',
      display: 'flex',
      width: '100%',
      transition: 'height .5s cubic-bezier(0.4,0,0.2,1) 5ms',
    },
    variants: {
      areSubtitlesOpen: {
        true: {
          height: 'calc(100% - 12rem)',
        },
        false: {
          height: '100%',
        },
      },
    },
  })
)
