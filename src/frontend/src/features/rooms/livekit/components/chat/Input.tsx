import { Button, TextArea } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { RiAddLine, RiSendPlane2Fill } from '@remixicon/react'
import { useState, useEffect, RefObject, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'

const MAX_ROWS = 6

interface ChatInputProps {
  inputRef: RefObject<HTMLTextAreaElement>
  onSubmit: (text: string) => void
  onUploadFiles: (files: FileList | File[]) => Promise<void>
  isSending: boolean
}

export const ChatInput = ({
  inputRef,
  onSubmit,
  onUploadFiles,
  isSending,
}: ChatInputProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.chat.input' })
  const [text, setText] = useState('')
  const [rows, setRows] = useState(1)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    onSubmit(text)
    setText('')
  }

  const isDisabled = !text.trim() || isSending || isUploading

  const handleFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) {
      return
    }

    try {
      setUploadError(null)
      setIsUploading(true)
      await onUploadFiles(files)
    } catch {
      setUploadError(t('upload.error'))
    } finally {
      setIsUploading(false)
    }
  }

  const submitOnEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || (e.key === 'Enter' && e.shiftKey)) return
    e.preventDefault()
    if (!isDisabled) handleSubmit()
  }

  useEffect(() => {
    const resize = () => {
      if (!inputRef.current) return

      const textAreaLineHeight = 20 // Adjust this value based on your TextArea's line height
      const previousRows = inputRef.current.rows
      inputRef.current.rows = 1

      const currentRows = Math.floor(
        inputRef.current.scrollHeight / textAreaLineHeight
      )

      if (currentRows === previousRows) {
        inputRef.current.rows = currentRows
      }

      if (currentRows >= MAX_ROWS) {
        inputRef.current.rows = MAX_ROWS
        inputRef.current.scrollTop = inputRef.current.scrollHeight
      }

      if (currentRows < MAX_ROWS) {
        inputRef.current.style.overflowY = 'hidden'
      } else {
        inputRef.current.style.overflowY = 'auto'
      }

      setRows(currentRows < MAX_ROWS ? currentRows : MAX_ROWS)
    }

    resize()
  }, [text, inputRef])

  return (
    <HStack
      className={css({
        margin: '0.75rem 0 1.5rem',
        padding: '0.5rem',
        backgroundColor: 'gray.100',
        borderRadius: 4,
        borderWidth: isDraggingFile ? '1px' : '0',
        borderStyle: 'dashed',
        borderColor: 'primary.500',
      })}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!isUploading) setIsDraggingFile(true)
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setIsDraggingFile(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setIsDraggingFile(false)
        if (isUploading) return
        void handleFiles(event.dataTransfer.files)
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className={css({ display: 'none' })}
        onChange={(event) => {
          if (!event.target.files) return
          void handleFiles(event.target.files)
          event.target.value = ''
        }}
      />
      <Button
        square
        invisible
        variant="tertiaryText"
        size="sm"
        isDisabled={isSending || isUploading}
        aria-label={t('upload.buttonLabel')}
        onPress={() => fileInputRef.current?.click()}
      >
        <RiAddLine />
      </Button>
      <TextArea
        ref={inputRef}
        onKeyDown={(e) => {
          e.stopPropagation()
          submitOnEnter(e)
        }}
        onKeyUp={(e) => e.stopPropagation()}
        placeholder={t('textArea.placeholder')}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
        }}
        rows={rows || 1}
        style={{
          border: 'none',
          resize: 'none',
          height: 'auto',
          minHeight: `34px`,
          lineHeight: 1.25,
          padding: '7px 10px',
          overflowY: 'hidden',
        }}
        placeholderStyle={'strong'}
        spellCheck={false}
        maxLength={2000}
        aria-label={t('textArea.label')}
      />
      <Button
        square
        invisible
        variant="tertiaryText"
        size="sm"
        onPress={handleSubmit}
        isDisabled={isDisabled}
        aria-label={t('button.label')}
      >
        <RiSendPlane2Fill />
      </Button>
      {isUploading && (
        <span className={css({ fontSize: 'xs', color: 'gray.700' })}>
          {t('upload.loading')}
        </span>
      )}
      {uploadError && (
        <span className={css({ fontSize: 'xs', color: 'danger' })}>
          {uploadError}
        </span>
      )}
    </HStack>
  )
}
