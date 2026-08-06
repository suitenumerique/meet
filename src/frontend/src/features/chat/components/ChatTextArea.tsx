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
import { ChatAttachButton } from './ChatAttachButton'

const StyledContainer = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'flex-end',
    margin: '0.75rem 0 1.5rem',
    padding: '0.5rem',
    backgroundColor: 'gray.100',
    borderRadius: 4,
  },
})

type ChatTextAreaProps = {
  onAttach: (file: File) => void
  onSendMedia: () => void
  isMediaEnabled: boolean
  acceptedMimetypes: string[]
}

export const ChatTextArea = ({
  onAttach,
  onSendMedia,
  isMediaEnabled,
  acceptedMimetypes,
}: ChatTextAreaProps) => {
  const { isSending, isPreparing, send, textAreaValue, pendingAttachment } =
    useSnapshot(chatStore)

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
    // A staged image takes precedence: the text box then holds its caption,
    // and the two go out as one stream rather than as two messages.
    if (chatStore.pendingAttachment) {
      await onSendMedia()
      inputRef?.current?.focus({ preventScroll: true })
      return
    }
    const text = chatStore.textAreaValue
    if (!send || !text) return
    await send(text)
    inputRef?.current?.focus({ preventScroll: true })
    clearTextAreaValue()
  }, [send, inputRef, onSendMedia])

  const isDisabled =
    (!textAreaValue.trim() && !pendingAttachment) || isSending || isPreparing

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

  /**
   * Pasting is what a screenshot actually wants: the operating system puts it
   * on the clipboard, and there is no file on disk to pick or drag.
   */
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!isMediaEnabled) return
    const file = Array.from(e.clipboardData.files).find((candidate) =>
      candidate.type.startsWith('image/')
    )
    if (!file) return
    e.preventDefault()
    onAttach(file)
  }

  return (
    <StyledContainer>
      {isMediaEnabled && (
        <ChatAttachButton
          onSelect={onAttach}
          isDisabled={isSending || isPreparing}
          acceptedMimetypes={acceptedMimetypes}
        />
      )}
      <TextArea
        ref={inputRef}
        value={textAreaValue}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onPaste={onPaste}
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
        placeholder={t(
          pendingAttachment
            ? 'textArea.captionPlaceholder'
            : 'textArea.placeholder'
        )}
        aria-label={t('textArea.label')}
      />
      <ChatSubmitButton handleSubmit={handleSubmit} isDisabled={isDisabled} />
    </StyledContainer>
  )
}
