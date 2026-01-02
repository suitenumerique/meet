import { RecordingMode } from '@/features/recording'
import { useRoomMetadata } from './useRoomMetadata'
import { useMemo } from 'react'

export enum RecordingStatus {
  Starting = 'starting',
  Started = 'started',
  Saving = 'saving',
}

const ACTIVE_STATUSES = [
  RecordingStatus.Starting,
  RecordingStatus.Started,
  RecordingStatus.Saving,
] as const

export interface RecordingStatuses {
  isAnotherModeStarted: boolean
  isStarting: boolean
  isStarted: boolean
  isSaving: boolean
  isActive: boolean
}

export const useRecordingStatuses = (
  mode: RecordingMode
): RecordingStatuses => {
  const metadata = useRoomMetadata()

  return useMemo(() => {
    if (metadata && metadata?.recording_mode === mode) {
      return {
        isAnotherModeStarted: false,
        isStarting: metadata.recording_status === RecordingStatus.Starting,
        isStarted: metadata.recording_status === RecordingStatus.Started,
        isSaving: metadata.recording_status === RecordingStatus.Saving,
        isActive: ACTIVE_STATUSES.includes(
          metadata.recording_status as RecordingStatus
        ),
      }
    }

    const isAnotherModeStarted =
      !!metadata?.recording_mode &&
      metadata?.recording_mode !== mode &&
      ACTIVE_STATUSES.includes(metadata.recording_status as RecordingStatus)

    return {
      isAnotherModeStarted,
      isStarting: false,
      isStarted: false,
      isSaving: false,
      isActive: false,
    }
  }, [mode, metadata])
}
