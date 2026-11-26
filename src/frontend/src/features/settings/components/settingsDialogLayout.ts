import { css } from '@/styled-system/css'

/**
 * Layout of the settings dialogs, after the tabbed modal of the UI kit: a
 * sidebar with the tabs, then the selected tab, under its title.
 */

export const tabsStyle = css({
  maxHeight: 'var(--settings-dialog-max-height)',
  width: '50rem', // fixme size copied from meet settings modal
  // fixme hacky solution to cancel modal padding, so the tab list fills the
  // modal from edge to edge
  margin: '-1.5rem',
  maxWidth: 'calc(100% + 3rem)',
  overflow: 'hidden',
  height: 'calc(100vh - 2rem)',
  borderRadius: 7, // modal radius, minus its border
})

export const SIDEBAR_WIDTH = '228px'

export const sidebarStyle = css({
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'background.surface.tertiary',
  borderRight: '1px solid {colors.border.surface.primary}',
  padding: '1.5rem 1rem 1rem',
  '& > [slot=title]': {
    margin: 0,
    marginBottom: '0.5rem',
    // aligns the title with the label of the tabs
    paddingInline: '0.5rem',
    fontSize: '1.125rem',
    fontWeight: 'bold',
    lineHeight: '1.5rem',
  },
  '& [role=tablist]': {
    gap: '0.25rem',
  },
})

export const contentStyle = css({
  display: 'flex',
  flexDirection: 'column',
  flexGrow: 1,
  minWidth: 0,
  minHeight: 0,
  // The selected tab scrolls under the title, which stays in place.
  '& > [role=tabpanel]': {
    flexGrow: 1,
    minWidth: 0,
    minHeight: 0,
    marginTop: 0,
    overflowY: 'auto',
    scrollbarGutter: 'stable',
    // the scrollbar is 8px wide, 2px away from the border of the dialog
    marginRight: '2px',
    padding: '1rem 1.5rem 1.5rem',
    paddingRight: 'calc(1.5rem - 10px)',
  },
  // sections of a tab, under its title
  '& > [role=tabpanel] h2': {
    fontSize: '1rem',
    lineHeight: '1.5rem',
  },
})

/**
 * Title of the selected tab, on the line of the title of the dialog. The
 * close button of the dialog sits in the corner, above it.
 */
export const contentTitleStyle = css({
  flexShrink: 0,
  margin: 0,
  padding: '1.5rem 1.5rem 0',
  fontSize: '1.125rem',
  fontWeight: 'bold',
  lineHeight: '1.5rem',
})
