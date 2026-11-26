import { cva, cx } from '@/styled-system/css'
import { subtleScrollbar } from '@/styles/scrollbar'

const scrollArea = cva({
  base: {
    overflowY: 'auto',
    // the content keeps the same width whether the area scrolls or not
    scrollbarGutter: 'stable',
    marginRight: '2px',
  },
  variants: {
    // Horizontal padding of the content. The right one is reduced by the 10px
    // taken by the scrollbar (8px) and its distance to the border of the panel
    // (2px), so the content stays centered in the panel.
    inset: {
      md: {
        paddingLeft: '1.5rem',
        paddingRight: 'calc(1.5rem - 10px)',
      },
      sm: {
        paddingLeft: '0.75rem',
        paddingRight: 'calc(0.75rem - 10px)',
      },
      xs: {
        paddingLeft: '0.625rem',
        paddingRight: 'calc(0.625rem - 10px)',
      },
    },
  },
  defaultVariants: {
    inset: 'md',
  },
})

/**
 * Scrollable content of a side panel, with the same scrollbar as the chat,
 * displayed next to the right border of the panel.
 */
export const sidePanelScrollArea = (props?: Parameters<typeof scrollArea>[0]) =>
  cx(subtleScrollbar, scrollArea(props))
