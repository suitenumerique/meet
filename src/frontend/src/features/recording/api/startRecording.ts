import { useMutation, UseMutationOptions } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import { ApiError } from '@/api/ApiError'
import { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { RecordingMode } from '../types'

export interface StartRecordingParams {
  id: string
  mode?: RecordingMode
  options?: Record<string, string | boolean>
}

const startRecording = ({
  id,
  mode = RecordingMode.Transcript,
  options,
}: StartRecordingParams): Promise<ApiRoom> => {
  return fetchApi(`rooms/${id}/start-recording/`, {
    method: 'POST',
    body: JSON.stringify({
      mode: mode,
      options: options,
    }),
  })
}

export function useStartRecording(
  options?: UseMutationOptions<ApiRoom, ApiError, StartRecordingParams>
) {
  return useMutation<ApiRoom, ApiError, StartRecordingParams>({
    mutationFn: startRecording,
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  })
}
