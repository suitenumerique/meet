import { useTranslation } from 'react-i18next'
import type { ChatRow } from '@/stores/chat'
import { Text } from '@/primitives'
import { styled } from '@/styled-system/jsx'
import { ChatMessageMetadata } from './ChatMessageMedata'
import { ChatMessageBody } from './ChatMessageBody'

const StyledContainer = styled('li', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
})

type ChatMessageProps = {
  item: ChatRow
}

export const ChatMessage = ({ item }: ChatMessageProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat.everyRoom' })
  const time = new Date(item.timestamp)
  const locale = navigator ? navigator.language : 'en-US'
  return (
    <StyledContainer
      title={time.toLocaleTimeString(locale, { timeStyle: 'full' })}
    >
      {!item.hideMetadata && (
        <ChatMessageMetadata
          timestamp={item.timestamp}
          identity={item.identity}
        />
      )}
      {item.toEveryRoom && <Text variant="xsNote">{t('tag')}</Text>}
      <ChatMessageBody message={item.message} />
    </StyledContainer>
  )
}
