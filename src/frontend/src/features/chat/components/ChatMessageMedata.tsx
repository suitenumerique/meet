import { styled } from '@/styled-system/jsx'
import { ChatRow, chatStore } from '@/stores/chat'
import React, { useMemo } from 'react'
import { useSnapshot } from 'valtio'
import { Text } from '@/primitives'

const StyledContainer = styled('span', {
  base: {
    display: 'flex',
    gap: '0.5rem',
    paddingTop: '0.75rem',
  },
})

type ChatMessageMetadataProps = Pick<ChatRow, 'identity' | 'timestamp'>

export const ChatMessageMetadata = React.memo(
  ({ identity, timestamp }: ChatMessageMetadataProps) => {
    const time = new Date(timestamp)
    const locale = navigator ? navigator.language : 'en-US'

    const { names } = useSnapshot(chatStore)

    const currentDisplayName = useMemo(() => {
      if (identity) return names[identity] ?? identity
    }, [names, identity])

    return (
      <StyledContainer>
        <Text bold={true} variant="sm">
          {currentDisplayName}
        </Text>
        <Text variant="smNote" wrap="no">
          {time.toLocaleTimeString(locale, { timeStyle: 'short' })}
        </Text>
      </StyledContainer>
    )
  }
)

ChatMessageMetadata.displayName = 'ChatMessageMetadata'
