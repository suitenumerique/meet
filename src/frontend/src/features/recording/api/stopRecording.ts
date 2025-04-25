import { useMutation, UseMutationOptions } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import { ApiError } from '@/api/ApiError'
import { ApiRoom } from '@/features/rooms/api/ApiRoom'

export interface StopRecordingParams {
  id: string
}

const stopRecording = ({ id }: StopRecordingParams): Promise<ApiRoom> => {
  return fetchApi(`rooms/${id}/stop-recording/`, {
    method: 'POST',
  })
}

export function useStopRecording(
  options?: UseMutationOptions<ApiRoom, ApiError, StopRecordingParams>
) {
  return useMutation<ApiRoom, ApiError, StopRecordingParams>({
    mutationFn: stopRecording,
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  })
}
