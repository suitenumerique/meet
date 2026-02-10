import { fetchApi } from '@/api/fetchApi'

interface RequestChatFileUploadUrlParams {
  roomId: string
  token: string
  filename: string
  contentType?: string
}

interface ApiChatFileUploadUrl {
  upload_url: string
  download_url: string
  filename: string
  content_type: string
}

export const requestChatFileUploadUrl = ({
  roomId,
  token,
  filename,
  contentType,
}: RequestChatFileUploadUrlParams) => {
  return fetchApi<ApiChatFileUploadUrl>(`/rooms/${roomId}/chat-file-upload-url/`, {
    method: 'POST',
    body: JSON.stringify({
      token,
      filename,
      content_type: contentType,
    }),
  })
}
