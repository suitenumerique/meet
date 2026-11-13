import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { Track } from 'livekit-client'
import { describe, expect, it } from 'vitest'
import { orderCarouselTiles } from './orderCarouselTiles'

type Tile = TrackReferenceOrPlaceholder

// Placeholder tiles are enough: the real LiveKit sort and update run on them.
const tile = (
  identity: string,
  joinedAt: number,
  {
    source = Track.Source.Camera,
    isLocal = false,
    isSpeaking = false,
    hasSpoken = isSpeaking,
    handRaisedAt,
  }: {
    source?: Track.Source
    isLocal?: boolean
    isSpeaking?: boolean
    hasSpoken?: boolean
    handRaisedAt?: string
  } = {}
) =>
  ({
    participant: {
      identity,
      isLocal,
      isSpeaking,
      audioLevel: isSpeaking ? 1 : 0,
      lastSpokeAt: hasSpoken ? new Date(joinedAt) : undefined,
      joinedAt: new Date(joinedAt),
      isCameraEnabled: false,
      attributes: handRaisedAt ? { handRaisedAt } : {},
    },
    source,
  }) as unknown as Tile

const names = (tiles: Tile[]) =>
  tiles.map((t) =>
    t.source === Track.Source.ScreenShare
      ? `${t.participant.identity}:screen`
      : t.participant.identity
  )

const me = tile('me', 0, { isLocal: true })
const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map((id, i) =>
  tile(id, i + 1)
)
const speaking = (t: Tile) =>
  tile(t.participant.identity, t.participant.joinedAt!.getTime(), {
    isSpeaking: true,
  })
const quietAgain = (t: Tile) =>
  tile(t.participant.identity, t.participant.joinedAt!.getTime(), {
    hasSpoken: true,
  })
const handUp = (t: Tile, minute = 0) =>
  tile(t.participant.identity, t.participant.joinedAt!.getTime(), {
    isLocal: t.participant.isLocal,
    handRaisedAt: new Date(Date.UTC(2026, 0, 1, 10, minute)).toISOString(),
  })
const screenOf = (t: Tile) =>
  tile(t.participant.identity, t.participant.joinedAt!.getTime(), {
    source: Track.Source.ScreenShare,
  })

describe('orderCarouselTiles', () => {
  it('follows the LiveKit sort on the first render', () => {
    expect(names(orderCarouselTiles([], [d, c, b, a, me], 3))).toEqual([
      'me',
      'a',
      'b',
      'c',
      'd',
    ])
  })

  it('puts a new speaker right below the local camera', () => {
    const previous = orderCarouselTiles([], [me, a, b, c, d, e], 4)
    const next = orderCarouselTiles(previous, [me, a, b, c, d, speaking(e)], 4)

    // LiveKit alone would give me, a, b, e: `e` takes the slot of `c`.
    expect(names(next).slice(0, 4)).toEqual(['me', 'e', 'a', 'b'])
  })

  it('keeps the order of the tiles that stay visible', () => {
    let tiles = orderCarouselTiles([], [me, a, b, c, d, e], 4)
    tiles = orderCarouselTiles(tiles, [me, a, b, c, speaking(d), e], 4)
    expect(names(tiles).slice(0, 4)).toEqual(['me', 'd', 'a', 'b'])

    // `d` went quiet, `e` speaks: `d` stays ahead of `a`, `b` is evicted.
    tiles = orderCarouselTiles(
      tiles,
      [me, a, b, c, quietAgain(d), speaking(e)],
      4
    )
    expect(names(tiles).slice(0, 4)).toEqual(['me', 'e', 'd', 'a'])
  })

  it('does not move a visible participant who speaks', () => {
    const previous = orderCarouselTiles([], [me, a, b, c, d], 4)
    const next = orderCarouselTiles(previous, [me, a, b, speaking(c), d], 4)

    expect(names(next)).toEqual(['me', 'a', 'b', 'c', 'd'])
  })

  it('keeps screen shares above a new speaker', () => {
    const previous = orderCarouselTiles([], [me, screenOf(a), a, b, c, d], 4)
    expect(names(previous).slice(0, 4)).toEqual(['me', 'a:screen', 'a', 'b'])

    const next = orderCarouselTiles(
      previous,
      [me, screenOf(a), a, b, c, speaking(d)],
      4
    )
    expect(names(next).slice(0, 4)).toEqual(['me', 'a:screen', 'd', 'a'])
  })

  it('puts a screen share that starts below the local camera', () => {
    const previous = orderCarouselTiles([], [me, a, b, c, d], 4)
    const next = orderCarouselTiles(previous, [me, a, b, c, d, screenOf(d)], 4)

    expect(names(next).slice(0, 4)).toEqual(['me', 'd:screen', 'a', 'b'])
  })

  it('fills the slot of a participant who left without reordering', () => {
    const previous = orderCarouselTiles([], [me, a, b, c, d], 4)
    const next = orderCarouselTiles(previous, [me, b, c, d], 4)

    expect(names(next)).toEqual(['me', 'd', 'b', 'c'])
  })

  it('brings a raised hand to the top like a speaker', () => {
    const previous = orderCarouselTiles([], [me, a, b, c, d, e], 4)
    const next = orderCarouselTiles(previous, [me, a, b, c, d, handUp(e)], 4)

    expect(names(next).slice(0, 4)).toEqual(['me', 'e', 'a', 'b'])
  })

  it('keeps a raised hand visible when others speak', () => {
    let tiles = orderCarouselTiles([], [me, a, b, c, d, e], 3)
    tiles = orderCarouselTiles(tiles, [me, a, b, c, d, handUp(e)], 3)
    expect(names(tiles).slice(0, 3)).toEqual(['me', 'e', 'a'])

    // `d` speaks: it evicts `a`, not the raised hand.
    tiles = orderCarouselTiles(tiles, [me, a, b, c, speaking(d), handUp(e)], 3)
    expect(names(tiles).slice(0, 3)).toEqual(['me', 'd', 'e'])
  })

  it('lets the current speaker in when hands fill the carousel', () => {
    let tiles = orderCarouselTiles([], [me, handUp(a, 1), handUp(b, 2), c], 3)
    expect(names(tiles).slice(0, 3)).toEqual(['me', 'a', 'b'])

    // The last hand raised gives way to the speaker.
    tiles = orderCarouselTiles(
      tiles,
      [me, handUp(a, 1), handUp(b, 2), speaking(c)],
      3
    )
    expect(names(tiles).slice(0, 3)).toEqual(['me', 'c', 'a'])
  })

  it('gives the slot of a lowered hand to the next one waiting', () => {
    let tiles = orderCarouselTiles(
      [],
      [me, handUp(a, 1), handUp(b, 2), handUp(c, 3)],
      3
    )
    expect(names(tiles).slice(0, 3)).toEqual(['me', 'a', 'b'])

    // `a` lowers their hand: `c` was waiting and takes over.
    tiles = orderCarouselTiles(tiles, [me, a, handUp(b, 2), handUp(c, 3)], 3)
    expect(names(tiles).slice(0, 3)).toEqual(['me', 'c', 'b'])
  })

  it('shows the first hands raised when there are too many', () => {
    const tiles = orderCarouselTiles(
      [],
      [me, a, handUp(b, 3), handUp(c, 1), handUp(d, 2)],
      3
    )

    expect(names(tiles).slice(0, 3)).toEqual(['me', 'c', 'd'])
  })

  it('keeps the local camera first when the local hand is raised', () => {
    const tiles = orderCarouselTiles([], [a, screenOf(a), b, handUp(me)], 3)

    expect(names(tiles)).toEqual(['me', 'a:screen', 'a', 'b'])
  })

  it('is stable when run twice on the same input', () => {
    const tracks = [me, a, b, c, d, speaking(e)]
    const previous = orderCarouselTiles([], [me, a, b, c, d, e], 4)

    const once = orderCarouselTiles(previous, tracks, 4)
    expect(names(orderCarouselTiles(once, tracks, 4))).toEqual(names(once))
  })
})
