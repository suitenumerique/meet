import { fetchApi } from '@/api/fetchApi'
import { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { RecordingMode, RecordingStatus } from '@/features/recording'

export type RecordingApi = {
  id: string
  room: Pick<ApiRoom, 'id' | 'name' | 'slug' | 'access_level'>
  created_at: string
  key: string
  mode: RecordingMode
  status: RecordingStatus
}

export const fetchRecording = ({ recordingId }: { recordingId?: string }) => {
  return fetchApi<RecordingApi>(`/recordings/${recordingId}/`)
}
