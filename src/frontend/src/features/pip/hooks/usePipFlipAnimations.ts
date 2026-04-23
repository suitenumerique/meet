import { useLayoutEffect, useRef, type RefObject } from 'react'

type Options = {
  /** Animation duration in ms. */
  duration?: number
  /** CSS easing function. */
  easing?: string
}

/**
 * FLIP (First, Last, Invert, Play) animation hook.
 *
 * For every keyed direct child of `containerRef`, records its position
 * before a render (the "first" rect) and, once the DOM has committed, plays
 * an inverse transform back to the identity position. The effect is a
 * smooth slide whenever tiles are added, removed, reordered, or a new grid
 * shape shifts them.
 *
 * Safe to call inside a Document PiP window: uses the element's own
 * Web Animations API (element.animate) which lives in the PiP document.
 * Respects `prefers-reduced-motion` and no-ops on the first mount.
 */
export const usePipFlipAnimations = <T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  keys: ReadonlyArray<string>,
  { duration = 220, easing = 'cubic-bezier(0.2, 0, 0, 1)' }: Options = {}
) => {
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map())
  const firstRunRef = useRef(true)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const doc = container.ownerDocument
    const view = doc.defaultView
    const reduceMotion = view?.matchMedia('(prefers-reduced-motion: reduce)')
      .matches

    const children = Array.from(container.children) as HTMLElement[]
    const nextRects = new Map<string, DOMRect>()
    children.forEach((el, i) => {
      const key = keys[i]
      if (!key) return
      nextRects.set(key, el.getBoundingClientRect())
    })

    if (firstRunRef.current) {
      firstRunRef.current = false
      prevRectsRef.current = nextRects
      return
    }

    if (!reduceMotion) {
      children.forEach((el, i) => {
        const key = keys[i]
        if (!key) return
        const prev = prevRectsRef.current.get(key)
        const next = nextRects.get(key)
        if (!prev || !next) return

        const dx = prev.left - next.left
        const dy = prev.top - next.top
        const sx = next.width === 0 ? 1 : prev.width / next.width
        const sy = next.height === 0 ? 1 : prev.height / next.height

        // Skip no-ops: sub-pixel shifts don't benefit from animation.
        if (
          Math.abs(dx) < 1 &&
          Math.abs(dy) < 1 &&
          Math.abs(sx - 1) < 0.01 &&
          Math.abs(sy - 1) < 0.01
        )
          return

        el.animate(
          [
            {
              transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
            },
            { transform: 'translate(0, 0) scale(1, 1)' },
          ],
          { duration, easing, fill: 'backwards' }
        )
      })
    }

    prevRectsRef.current = nextRects
  }, [containerRef, duration, easing, keys])
}
