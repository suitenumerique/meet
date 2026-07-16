import { TextArea } from '@/primitives'
import { styled } from '@/styled-system/jsx'
import React, { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import {
  chatStore,
  clearTextAreaValue,
  persistTextAreaValue,
} from '@/stores/chat'
import { ChatSubmitButton } from './ChatSubmitButton'

const StyledContainer = styled('div', {
  base: {
    display: 'flex',
    margin: '0.75rem 0 1.5rem',
    padding: '0.5rem',
    backgroundColor: 'gray.100',
    borderRadius: 4,
  },
})

export const ChatTextArea = () => {
  const { isSending, send, textAreaValue } = useSnapshot(chatStore)

  const { t } = useTranslation('rooms', { keyPrefix: 'controls.chat.input' })

  const inputRef = React.useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const raf = requestAnimationFrame(() => {
      el.focus({ preventScroll: true })
      const end = el.value.length
      el.setSelectionRange(end, end)
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  const handleSubmit = useCallback(async () => {
    const text = chatStore.textAreaValue
    if (!send || !text) return
    await send(text)
    inputRef?.current?.focus({ preventScroll: true })
    clearTextAreaValue()
  }, [send, inputRef])

  const isDisabled = !textAreaValue.trim() || isSending

  const onKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()
    if (e.key !== 'Enter' || (e.key === 'Enter' && e.shiftKey) || isDisabled)
      return
    e.preventDefault()
    await handleSubmit()
  }

  const onKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()
  }

  return (
    <StyledContainer>
      <TextArea
        ref={inputRef}
        value={textAreaValue}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onChange={(e) => {
          persistTextAreaValue(e.target.value)
        }}
        fieldSizing={'content'}
        style={{
          border: 'none',
          resize: 'none',
          height: 'auto',
          maxHeight: '240px',
          minHeight: `34px`,
          lineHeight: 1.25,
          padding: '7px 10px',
        }}
        placeholderStyle="strong"
        spellCheck={false}
        maxLength={2000}
        placeholder={t('textArea.placeholder')}
        aria-label={t('textArea.label')}
      />
      <ChatSubmitButton handleSubmit={handleSubmit} isDisabled={isDisabled} />
    </StyledContainer>
  )
}
