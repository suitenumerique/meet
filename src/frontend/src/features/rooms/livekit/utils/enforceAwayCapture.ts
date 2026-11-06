/** Retry accidental capture while away, with bounded attempts and a final error. */
type MediaParticipant = {
  isCameraEnabled: boolean
  isMicrophoneEnabled: boolean
  setCameraEnabled: (enabled: boolean) => Promise<unknown>
  setMicrophoneEnabled: (enabled: boolean) => Promise<unknown>
}

const isCapturing = (participant: MediaParticipant): boolean =>
  participant.isCameraEnabled || participant.isMicrophoneEnabled

async function stopActiveTracks(participant: MediaParticipant): Promise<void> {
  await Promise.allSettled([
    participant.isCameraEnabled
      ? participant.setCameraEnabled(false)
      : Promise.resolve(),
    participant.isMicrophoneEnabled
      ? participant.setMicrophoneEnabled(false)
      : Promise.resolve(),
  ])
}

async function retryCaptureStop(
  participant: MediaParticipant,
  shouldStop: () => boolean,
  pause: () => Promise<void>,
  remaining: number
): Promise<void> {
  if (!shouldStop() || !isCapturing(participant)) return

  await stopActiveTracks(participant)
  if (!shouldStop() || !isCapturing(participant)) return

  if (remaining <= 1) {
    throw new Error('Unable to stop media capture while away')
  }
  await pause()
  return retryCaptureStop(participant, shouldStop, pause, remaining - 1)
}

export async function enforceAwayCapture(
  participant: MediaParticipant,
  shouldStop: () => boolean,
  pause: () => Promise<void> = () =>
    new Promise((resolve) => setTimeout(resolve, 500))
): Promise<void> {
  await retryCaptureStop(participant, shouldStop, pause, 3)
}
