import {
  ListBox,
  ListBoxItem,
  ListLayout,
  Virtualizer,
} from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { ChatMessage } from './ChatMessage.tsx'
import { useLayoutEffect, useRef } from 'react'
import { useSnapshot } from 'valtio'
import { ChatRow, chatStore } from '@/stores/chat'

// Estimated height of a chat entry in px. ListLayout measures the real
// rendered height of each row; this value is only used to size the
// scrollbar before rows have been measured.
const ESTIMATED_ROW_HEIGHT = 56
const BOTTOM_THRESHOLD_PX = 32

export const ChatMessages = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat' })
  const { rows: items } = useSnapshot(chatStore)

  const listRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const pin = () => {
      if (stick.current) el.scrollTop = el.scrollHeight
    }
    const onScroll = () => {
      stick.current =
        el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX
    }
    const ro = new ResizeObserver(pin)
    // Sizer div = ListLayout's content size. Fires on append, and again each
    // time an estimated row height is replaced by a measured one.
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    // Container. Height goes 0 -> N as the panel animates in, and on resize.
    ro.observe(el)
    el.addEventListener('scroll', onScroll, { passive: true })
    pin()
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <Virtualizer
      layout={ListLayout}
      layoutOptions={{
        estimatedRowSize: ESTIMATED_ROW_HEIGHT,
        gap: 4,
        padding: 4,
      }}
    >
      <ListBox
        ref={listRef}
        aria-label={t('messagesLabel', 'Chat messages')}
        items={items}
        selectionMode="none"
        style={{
          display: 'block',
          height: '100%',
          width: '100%',
          overflow: 'auto',
        }}
      >
        {(item: ChatRow) => (
          <ListBoxItem style={{ width: '100%' }}>
            <ChatMessage item={item} />
          </ListBoxItem>
        )}
      </ListBox>
    </Virtualizer>
  )
}
