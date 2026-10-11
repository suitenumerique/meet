import { RoomEvent } from 'livekit-client'
import type { Room } from 'livekit-client'

/** Minimum time a speaker keeps the top slot before someone else can take it. */
export const TOP_SPEAKER_HOLD_MS = 2000

type SpeakerSource = Pick<Room, 'on' | 'off' | 'activeSpeakers'>

/**
 * Calls `onChange` with the participant who should hold the top speaker slot.
 *
 * The candidate is the loudest remote speaker for whom `isEligible` is true
 * (e.g. who has a tile in the layout). The slot is sticky: silence keeps the
 * current holder. A new speaker only takes over once the holder has had it for
 * `holdMs`, and only if they are still the loudest at that point; someone who
 * stops talking before then never steals it. A holder who is no longer
 * eligible (left, got pinned) is replaced right away.
 *
 * `onChange` only fires on an actual change. Returns an unsubscribe function.
 */
export function watchTopSpeaker(
  room: SpeakerSource,
  {
    isEligible,
    onChange,
    holdMs = TOP_SPEAKER_HOLD_MS,
  }: {
    isEligible: (identity: string) => boolean
    onChange: (identity: string) => void
    holdMs?: number
  }
) {
  let holder: string | undefined
  let holdUntil = 0
  let retry: ReturnType<typeof setTimeout> | undefined

  const evaluate = () => {
    clearTimeout(retry)

    // `activeSpeakers` is sorted loudest first and is always current, which
    // the deferred retry needs; the event payload would be stale by then.
    const candidate = room.activeSpeakers.find(
      (p) => !p.isLocal && isEligible(p.identity)
    )?.identity
    if (!candidate || candidate === holder) return

    const wait = holder && isEligible(holder) ? holdUntil - Date.now() : 0
    if (wait > 0) {
      retry = setTimeout(evaluate, wait)
      return
    }

    holder = candidate
    holdUntil = Date.now() + holdMs
    onChange(candidate)
  }

  room.on(RoomEvent.ActiveSpeakersChanged, evaluate)
  return () => {
    room.off(RoomEvent.ActiveSpeakersChanged, evaluate)
    clearTimeout(retry)
  }
}
