const CHAT_ATTACHMENT_PREFIX = '[meet-attachment-v1]'

export interface ChatAttachmentPayload {
  filename: string
  size: number
  contentType: string
  downloadUrl: string
}

export const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

export const createAttachmentMessage = (payload: ChatAttachmentPayload) => {
  return `${CHAT_ATTACHMENT_PREFIX}${JSON.stringify(payload)}`
}

export const parseAttachmentMessage = (
  message: string
): ChatAttachmentPayload | null => {
  if (!message.startsWith(CHAT_ATTACHMENT_PREFIX)) {
    return null
  }

  try {
    const payload = JSON.parse(
      message.slice(CHAT_ATTACHMENT_PREFIX.length)
    ) as ChatAttachmentPayload
    const isValid =
      typeof payload.filename === 'string' &&
      typeof payload.size === 'number' &&
      typeof payload.contentType === 'string' &&
      typeof payload.downloadUrl === 'string' &&
      payload.downloadUrl.length > 0

    return isValid ? payload : null
  } catch {
    return null
  }
}
