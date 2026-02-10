import type { ReceivedChatMessage } from '@livekit/components-core'
import * as React from 'react'
import { css } from '@/styled-system/css'
import { Text } from '@/primitives'
import { MessageFormatter } from '@livekit/components-react'
import { useTranslation } from 'react-i18next'
import { formatBytes, parseAttachmentMessage } from './attachments'

export interface ChatEntryProps extends React.HTMLAttributes<HTMLLIElement> {
  entry: ReceivedChatMessage
  hideMetadata?: boolean
  messageFormatter?: MessageFormatter
}

export const ChatEntry: (
  props: ChatEntryProps & React.RefAttributes<HTMLLIElement>
) => React.ReactNode = /* @__PURE__ */ React.forwardRef<
  HTMLLIElement,
  ChatEntryProps
>(function ChatEntry(
  { entry, hideMetadata = false, messageFormatter, ...props }: ChatEntryProps,
  ref
) {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat.attachment' })
  const formattedMessage = React.useMemo(() => {
    return messageFormatter ? messageFormatter(entry.message) : entry.message
  }, [entry.message, messageFormatter])
  const attachment = React.useMemo(
    () => parseAttachmentMessage(entry.message),
    [entry.message]
  )
  const time = new Date(entry.timestamp)
  const locale = navigator ? navigator.language : 'en-US'

  return (
    <li
      className={css({
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
      })}
      ref={ref}
      title={time.toLocaleTimeString(locale, { timeStyle: 'full' })}
      data-lk-message-origin={entry.from?.isLocal ? 'local' : 'remote'}
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
      <Text
        variant="sm"
        margin={false}
        className={css({
          whiteSpace: 'pre-wrap',
          '& .lk-chat-link': {
            color: 'blue',
            textDecoration: 'underline',
          },
        })}
      >
        {attachment ? (
          <a
            href={attachment.downloadUrl}
            download={attachment.filename}
            className={css({
              display: 'inline-flex',
              flexDirection: 'column',
              gap: '0.1rem',
              padding: '0.4rem 0.6rem',
              borderRadius: 'md',
              backgroundColor: 'gray.100',
              textDecoration: 'none',
              color: 'blue.800',
            })}
            target="_blank"
            rel="noreferrer"
          >
            <strong>{attachment.filename}</strong>
            <span>
              {formatBytes(attachment.size)} · {attachment.contentType}
            </span>
            <span>{t('download')}</span>
          </a>
        ) : (
          formattedMessage
        )}
      </Text>
    </li>
  )
})
