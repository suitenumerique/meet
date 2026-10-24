import { useMutation, UseMutationOptions } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import type { ApiError } from '@/api/ApiError'
import type { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { keys } from '@/api/queryKeys'
import { RecordingMode } from '../types'
import type { RecordingEncoding } from '../hooks/useRecordingEncoding'

export interface StartRecordingOptions {
  language?: string
  transcribe?: boolean
  collect_metadata?: boolean
  original_mode?: RecordingMode
  encoding?: RecordingEncoding
}

export interface StartRecordingParams {
  id: string
  mode?: RecordingMode
  options?: StartRecordingOptions
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
    mutationKey: [keys.startRecording],
    mutationFn: startRecording,
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  })
}
