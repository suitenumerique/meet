import { tokenize, createDefaultGrammar } from '@livekit/components-core'
import { ReactNode } from 'react'
import { stripBidiControls } from './stripBidiControls'

const defaultGrammar = Object.freeze(createDefaultGrammar())

export function formatChatMessageLinks(message: string): ReactNode {
  const trimmedMessage = message.replace(/^[\r\n]+|[\r\n]+$/g, '')
  const cleanedMessage = stripBidiControls(trimmedMessage)
  return tokenize(cleanedMessage, defaultGrammar).map((tok, i) => {
    if (typeof tok === `string`) {
      return tok
    } else {
      const content = tok.content.toString()
      const href =
        tok.type === `url`
          ? /^http(s?):\/\//.test(content)
            ? content
            : `https://${content}`
          : `mailto:${content}`
      return (
        <a
          className="lk-chat-link"
          key={i}
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          {content}
        </a>
      )
    }
  })
}
