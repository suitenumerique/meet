import { useContext } from 'react'
import { TabListStateContext } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'

const selectedTabTitleStyle = css({
  flexShrink: 0,
  margin: 0,
  padding: '1.5rem 1.5rem 0',
  fontSize: '1.125rem',
  fontWeight: 'bold',
  lineHeight: '1.5rem',
})

/**
 * Title of the selected tab, on the line of the title of the dialog. The
 * close button of the dialog sits in the corner, above it.
 *
 * To render inside the tabs: it reads their selection, which they keep for
 * themselves.
 */
export const SelectedTabTitle = () => {
  const { t } = useTranslation('settings', { keyPrefix: 'tabs' })
  const selectedKey = useContext(TabListStateContext)?.selectedKey
  return (
    <h2 className={selectedTabTitleStyle}>
      {selectedKey != null && t(String(selectedKey))}
    </h2>
  )
}
