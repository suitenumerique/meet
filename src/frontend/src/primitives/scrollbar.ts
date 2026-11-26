import { css } from '@/styled-system/css'

/**
 * The scrollbar of the app: thin and gray, without track, displayed as long
 * as the element is scrollable, where the system one would hide when idle.
 *
 * To set on any element which scrolls:
 *
 *   <div className={cx(scrollbar, css({ overflowY: 'auto' }))} />
 */
export const scrollbar = css({
  '&::-webkit-scrollbar': {
    width: '8px',
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: 'transparent',
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: 'gray.100',
    borderRadius: '4px',
  },
  '&::-webkit-scrollbar-thumb:hover': {
    backgroundColor: 'gray.200',
  },
  // Firefox has no scrollbar pseudo-elements
  '@supports not selector(::-webkit-scrollbar)': {
    scrollbarWidth: 'thin',
    scrollbarColor: '{colors.gray.100} transparent',
  },
})
