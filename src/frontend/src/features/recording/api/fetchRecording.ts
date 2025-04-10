import { fetchApi } from '@/api/fetchApi'
import { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { RecordingMode } from '@/features/rooms/api/startRecording'

export type RecordingApi = {
  id: string
  room: Pick<ApiRoom, 'id' | 'name' | 'slug' | 'access_level'>
  created_at: string
  mode: RecordingMode
}

export const fetchRecording = ({
  recordingId,
}: {
  roomId: string
  username?: string
}) => {
  return fetchApi<RecordingApi>(`/recordings/${recordingId}/`)
}
