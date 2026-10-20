import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TranscriptDetailsList } from './TranscriptDetailsList'

describe('TranscriptDetailsList', () => {
  it('renders each detail as an item in an unordered list', () => {
    const markup = renderToStaticMarkup(
      <TranscriptDetailsList>
        <span>Destination</span>
        <span>Receiver</span>
        <span>Language</span>
      </TranscriptDetailsList>
    )

    expect(markup.match(/<ul\b/g)).toHaveLength(1)
    expect(markup.match(/<li\b/g)).toHaveLength(3)
  })
})
