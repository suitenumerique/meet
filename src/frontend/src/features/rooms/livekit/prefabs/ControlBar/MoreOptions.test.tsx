import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MoreOptions } from './MoreOptions'

describe('MoreOptions', () => {
  it('groups the meeting tools in a toolbar, not a navigation landmark', () => {
    const html = renderToStaticMarkup(
      <MoreOptions parentElement={{ current: null }} />
    )

    expect(html).not.toContain('<nav')
    expect(html).toContain('role="toolbar"')
  })
})
