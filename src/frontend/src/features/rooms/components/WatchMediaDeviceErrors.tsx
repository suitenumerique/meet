import { MediaDeviceErrorAlert } from './MediaDeviceErrorAlert'
import { useWatchMediaDeviceErrors } from '../livekit/hooks/useWatchMediaDeviceErrors'

/**
 * Single place responsible for the room's media device errors — mounts the
 * watcher and renders the resulting user-facing alert.
 */
export const WatchMediaDeviceErrors = () => {
  const { error, kind, clear } = useWatchMediaDeviceErrors()
  return <MediaDeviceErrorAlert error={error} kind={kind} onClose={clear} />
}
