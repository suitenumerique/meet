import {
  isTrackReference,
  isTrackReferencePinned,
  PIN_DEFAULT_STATE,
} from '@livekit/components-core'
import type {
  PinState,
  TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import {
  useCreateLayoutContext,
  useMaybeLayoutContext,
} from '@livekit/components-react'
import type { LayoutContextType } from '@livekit/components-react'
import { useCallback, useReducer, type Dispatch } from 'react'

/**
 * Maximum number of tiles a single participant can pin (keep in focus) at once.
 *
 * The pin state stays local to each participant, so this only bounds one user's
 * own focus grid. It is kept intentionally small so the grid stays readable when
 * several screen shares and cameras are pinned together (Zoom allows 9, Google
 * Meet 3 — 4 is a comfortable middle ground for side-by-side screen shares plus
 * an accessibility tile such as a sign-language interpreter).
 */
export const MAX_PINNED_TILES = 4

/**
 * Pin actions that operate on individual tiles, superseding LiveKit's built-in
 * `set_pin`/`clear_pin` reducer (which only ever holds a single tile). Every
 * action carries the track it targets so toggling one tile never affects the
 * others.
 */
export type MultiPinAction =
  | { msg: 'toggle_pin'; trackReference: TrackReferenceOrPlaceholder }
  | { msg: 'add_pin'; trackReference: TrackReferenceOrPlaceholder }
  | { msg: 'remove_pin'; trackReference: TrackReferenceOrPlaceholder }
  /**
   * Replace a pinned placeholder with its now-published track reference, in
   * place, without changing the pin order or count.
   */
  | { msg: 'replace_pin'; trackReference: TrackReferenceOrPlaceholder }

/** Whether `a` and `b` reference the same pinned tile (delegates to LiveKit). */
const isSamePinnedTrack = (
  a: TrackReferenceOrPlaceholder,
  b: TrackReferenceOrPlaceholder
) => isTrackReferencePinned(a, [b])

/**
 * A drop-in replacement for LiveKit's single-tile `pinReducer` that keeps an
 * ordered, de-duplicated list of pinned tiles bounded by {@link MAX_PINNED_TILES}.
 */
export function multiPinReducer(
  state: PinState,
  action: MultiPinAction
): PinState {
  switch (action.msg) {
    case 'add_pin': {
      if (isTrackReferencePinned(action.trackReference, state)) return state
      if (state.length >= MAX_PINNED_TILES) return state
      return [...state, action.trackReference]
    }
    case 'remove_pin': {
      const next = state.filter(
        (pinned) => !isSamePinnedTrack(pinned, action.trackReference)
      )
      // Preserve referential identity on a no-op so `useReducer` bails out and
      // dependent consumers/effects don't re-run needlessly.
      return next.length === state.length ? state : next
    }
    case 'toggle_pin':
      return isTrackReferencePinned(action.trackReference, state)
        ? multiPinReducer(state, {
            msg: 'remove_pin',
            trackReference: action.trackReference,
          })
        : multiPinReducer(state, {
            msg: 'add_pin',
            trackReference: action.trackReference,
          })
    case 'replace_pin': {
      let replaced = false
      const next = state.map((pinned) => {
        if (
          !isTrackReference(pinned) &&
          pinned.participant.identity ===
            action.trackReference.participant.identity &&
          pinned.source === action.trackReference.source
        ) {
          replaced = true
          return action.trackReference
        }
        return pinned
      })
      return replaced ? next : state
    }
    // Ignore any unknown action (e.g. LiveKit's `set_pin`/`clear_pin` reaching
    // us through the typed context boundary), mirroring LiveKit's own reducer.
    default:
      return state
  }
}

export interface MultiPinLayoutContext {
  /** The LiveKit layout context to feed `LayoutContextProvider`. */
  layoutContext: LayoutContextType
  /** The currently pinned tiles, in pin order. */
  pinnedTracks: PinState
  /** Strongly-typed dispatcher for multi-pin actions. */
  dispatchPin: Dispatch<MultiPinAction>
}

/**
 * Creates a LiveKit layout context whose `pin` slice supports multiple
 * simultaneous pins, while reusing LiveKit's `widget` slice untouched. Reads by
 * LiveKit hooks (`usePinnedTracks`, `isTrackReferencePinned`, …) keep working
 * because the pin state remains a plain `TrackReferenceOrPlaceholder[]`.
 */
export function useCreateMultiPinLayoutContext(): MultiPinLayoutContext {
  const base = useCreateLayoutContext()
  const [pinnedTracks, dispatchPin] = useReducer(
    multiPinReducer,
    PIN_DEFAULT_STATE
  )

  const layoutContext: LayoutContextType = {
    widget: base.widget,
    pin: {
      state: pinnedTracks,
      // Our reducer accepts a superset of LiveKit's `PinAction`. LiveKit never
      // dispatches pin actions on its own in this app (we replace every
      // `useFocusToggle` call site), so exposing our dispatcher through the
      // standard context is safe and keeps LiveKit consumers type-compatible.
      dispatch: dispatchPin as unknown as LayoutContextType['pin']['dispatch'],
    },
  }

  return { layoutContext, pinnedTracks, dispatchPin }
}

/** Typed access to the multi-pin dispatcher stored on the layout context. */
export function useMultiPinDispatch(): Dispatch<MultiPinAction> | undefined {
  const layoutContext = useMaybeLayoutContext()
  return layoutContext?.pin.dispatch as unknown as
    | Dispatch<MultiPinAction>
    | undefined
}

/** The currently pinned tiles (empty when outside a layout context). */
export function usePinnedTracksState(): PinState {
  return useMaybeLayoutContext()?.pin.state ?? []
}

export interface UseTogglePinResult {
  /** Whether this tile is currently pinned. */
  isPinned: boolean
  /** False when the tile is not pinned and the pin limit is already reached. */
  canPin: boolean
  /** Pin the tile if unpinned, unpin it if pinned — independently of the rest. */
  toggle: () => void
}

/**
 * Toggle a single tile's pin state independently of the other pinned tiles.
 * Replaces LiveKit's `useFocusToggle`, whose `clear_pin` would drop every pin.
 */
export function useTogglePin(
  trackReference: TrackReferenceOrPlaceholder
): UseTogglePinResult {
  const dispatch = useMultiPinDispatch()
  const pinnedTracks = usePinnedTracksState()

  const isPinned = isTrackReferencePinned(trackReference, pinnedTracks)
  const canPin = isPinned || pinnedTracks.length < MAX_PINNED_TILES

  const toggle = useCallback(() => {
    dispatch?.({ msg: 'toggle_pin', trackReference })
  }, [dispatch, trackReference])

  return { isPinned, canPin, toggle }
}
