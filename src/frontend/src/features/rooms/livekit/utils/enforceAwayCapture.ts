/** Retry accidental capture while away, with bounded attempts and a final error. */
export async function enforceAwayCapture(
  participant: {
    isCameraEnabled: boolean
    isMicrophoneEnabled: boolean
    setCameraEnabled: (enabled: boolean) => Promise<unknown>
    setMicrophoneEnabled: (enabled: boolean) => Promise<unknown>
  },
  shouldStop: () => boolean,
  pause: () => Promise<void> = () =>
    new Promise((resolve) => setTimeout(resolve, 500))
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!shouldStop()) return
    if (!participant.isCameraEnabled && !participant.isMicrophoneEnabled) return
    const stopped = await Promise.allSettled([
      participant.isCameraEnabled
        ? participant.setCameraEnabled(false)
        : Promise.resolve(),
      participant.isMicrophoneEnabled
        ? participant.setMicrophoneEnabled(false)
        : Promise.resolve(),
    ])
    if (!shouldStop()) return
    if (
      stopped.every((result) => result.status === 'fulfilled') &&
      !participant.isCameraEnabled &&
      !participant.isMicrophoneEnabled
    )
      return
    if (attempt < 2) await pause()
  }
  if (
    shouldStop() &&
    (participant.isCameraEnabled || participant.isMicrophoneEnabled)
  ) {
    throw new Error('Unable to stop media capture while away')
  }
}
