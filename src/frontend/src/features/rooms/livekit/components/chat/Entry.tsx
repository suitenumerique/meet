import type { ReceivedChatMessage } from '@livekit/components-core'
import * as React from 'react'
import { css } from '@/styled-system/css'
import { Text } from '@/primitives'
import { MessageFormatter } from '@livekit/components-react'
import { ChatReaction } from '@/stores/chatReactions'
import { ReactionPicker } from './ReactionPicker'
import { ReactionsDisplay } from './ReactionsDisplay'

export interface ChatEntryProps extends React.HTMLAttributes<HTMLLIElement> {
  entry: ReceivedChatMessage
  hideMetadata?: boolean
  messageFormatter?: MessageFormatter
  messageId?: string
  reactions?: ChatReaction[]
  currentUserIdentity?: string
  onReactionToggle?: (emoji: string) => void
}

export const ChatEntry: (
  props: ChatEntryProps & React.RefAttributes<HTMLLIElement>
) => React.ReactNode = /* @__PURE__ */ React.forwardRef<
  HTMLLIElement,
  ChatEntryProps
>(function ChatEntry(
  {
    entry,
    hideMetadata = false,
    messageFormatter,
    messageId,
    reactions = [],
    currentUserIdentity,
    onReactionToggle,
    ...props
  }: ChatEntryProps,
  ref
) {
  const [isHovered, setIsHovered] = React.useState(false)
  const formattedMessage = React.useMemo(() => {
    return messageFormatter ? messageFormatter(entry.message) : entry.message
  }, [entry.message, messageFormatter])
  const time = new Date(entry.timestamp)
  const locale = navigator ? navigator.language : 'en-US'

  const handleReactionSelect = React.useCallback(
    (emoji: string) => {
      if (onReactionToggle) {
        onReactionToggle(emoji)
      }
    },
    [onReactionToggle]
  )

  return (
    <li
      className={css({
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        position: 'relative',
      })}
      ref={ref}
      title={time.toLocaleTimeString(locale, { timeStyle: 'full' })}
      data-lk-message-origin={entry.from?.isLocal ? 'local' : 'remote'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      {!hideMetadata && (
        <span
          className={css({
            display: 'flex',
            gap: '0.5rem',
            paddingTop: '0.75rem',
          })}
        >
          <Text bold={true} variant="sm">
            {entry.from?.name ?? entry.from?.identity}
          </Text>
          <Text variant="sm" className={css({ color: 'gray.700' })}>
            {time.toLocaleTimeString(locale, { timeStyle: 'short' })}
          </Text>
        </span>
      )}
      <div
        className={css({
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
        })}
      >
        <Text
          variant="sm"
          margin={false}
          className={css({
            whiteSpace: 'pre-wrap',
            flex: 1,
            '& .lk-chat-link': {
              color: 'blue',
              textDecoration: 'underline',
            },
          })}
        >
          {formattedMessage}
        </Text>
        {messageId && onReactionToggle && (
          <div
            className={css({
              opacity: isHovered ? 1 : 0,
              transition: 'opacity 0.15s ease',
              flexShrink: 0,
            })}
          >
            <ReactionPicker onReactionSelect={handleReactionSelect} />
          </div>
        )}
      </div>
      {messageId && currentUserIdentity && reactions.length > 0 && (
        <ReactionsDisplay
          reactions={reactions}
          currentUserIdentity={currentUserIdentity}
          onReactionToggle={handleReactionSelect}
        />
      )}
    </li>
  )
})
