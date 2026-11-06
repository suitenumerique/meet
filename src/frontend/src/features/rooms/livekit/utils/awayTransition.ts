/**
 * Media state is deliberately ephemeral and scoped to the LiveKit room object.
 * A page reload must NOT silently restore camera or microphone capture.
 */
type MediaParticipant = {
  isCameraEnabled: boolean
  isMicrophoneEnabled: boolean
  setCameraEnabled: (enabled: boolean) => Promise<unknown>
  setMicrophoneEnabled: (enabled: boolean) => Promise<unknown>
}
type PreviousMediaState = { camera: boolean; microphone: boolean }

const previousMedia = new WeakMap<object, PreviousMediaState>()
// Local transition state lets room-level safety checks distinguish return
// restoration from an unexpected camera/microphone reactivation.
const stoppingRooms = new WeakSet<object>()
const restoringRooms = new WeakSet<object>()
const pendingRestores = new WeakSet<object>()

export function hasPendingMediaRestore(room: object): boolean {
  return pendingRestores.has(room)
}

export function isCaptureBlocked(room: object): boolean {
  return stoppingRooms.has(room)
}

export function isCaptureRestoring(room: object): boolean {
  return restoringRooms.has(room)
}

function assertSettled(results: PromiseSettledResult<unknown>[]) {
  const failed = results.find((result) => result.status === 'rejected')
  if (failed?.status === 'rejected') throw failed.reason
}

export async function updateAwayMode(
  room: object,
  participant: MediaParticipant,
  isAway: boolean,
  publishAwayStatus: (away: boolean) => Promise<unknown>
): Promise<void> {
  // The remote status can already be "present" when only one device was
  // restored. A second click must retry that device, not start a new break.
  if (!isAway && pendingRestores.has(room)) {
    await restoreMedia(room, participant)
    return
  }
  if (!isAway) {
    stoppingRooms.add(room)
    // Keep the original choices if the server update fails and the user
    // retries. Otherwise a retry after devices stopped would remember false.
    const previous = previousMedia.get(room) ?? {
      camera: participant.isCameraEnabled,
      microphone: participant.isMicrophoneEnabled,
    }
    // Disable both devices, even if one operation fails. Do not announce
    // absence until both have actually been stopped.
    try {
      const stopped = await Promise.allSettled([
        participant.setCameraEnabled(false),
        participant.setMicrophoneEnabled(false),
      ])
      assertSettled(stopped)
      // Never announce an absence while capture still reports enabled.
      if (participant.isCameraEnabled || participant.isMicrophoneEnabled) {
        throw new Error('Media capture is still active')
      }
      previousMedia.set(room, previous)
      await publishAwayStatus(true)
    } finally {
      stoppingRooms.delete(room)
    }
    return
  }

  // The server must acknowledge the end of the break before restoring media.
  await publishAwayStatus(false)
  if (previousMedia.has(room)) pendingRestores.add(room)
  await restoreMedia(room, participant)
}

async function restoreMedia(room: object, participant: MediaParticipant) {
  const previous = previousMedia.get(room)
  if (!previous) return // Reload/new instance: never auto-activate capture.
  restoringRooms.add(room)
  try {
    const restored = await Promise.allSettled([
      previous.camera && !participant.isCameraEnabled
        ? participant.setCameraEnabled(true)
        : Promise.resolve(),
      previous.microphone && !participant.isMicrophoneEnabled
        ? participant.setMicrophoneEnabled(true)
        : Promise.resolve(),
    ])
    assertSettled(restored)
    if (
      (previous.camera && !participant.isCameraEnabled) ||
      (previous.microphone && !participant.isMicrophoneEnabled)
    ) {
      throw new Error('Media restoration did not complete')
    }
    previousMedia.delete(room)
    pendingRestores.delete(room)
  } finally {
    restoringRooms.delete(room)
  }
}
