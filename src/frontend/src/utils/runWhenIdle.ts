/**
 * Run a non-urgent task once the page has finished loading and the main
 * thread is idle. Returns a function cancelling the task if it didn't run yet.
 *
 * @param task
 * @param timeout max delay (ms) to wait for an idle period once the page is loaded
 */
export const runWhenIdle = (task: () => void, timeout: number = 5000) => {
  let cancelSchedule: (() => void) | undefined

  const schedule = () => {
    // Safari doesn't support requestIdleCallback
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(task, { timeout })
      cancelSchedule = () => window.cancelIdleCallback(handle)
    } else {
      const handle = window.setTimeout(task, 1000)
      cancelSchedule = () => window.clearTimeout(handle)
    }
  }

  // Initial resources (scripts, styles, fonts...) are still being fetched
  // until the load event.
  if (document.readyState === 'complete') {
    schedule()
  } else {
    window.addEventListener('load', schedule, { once: true })
  }

  return () => {
    window.removeEventListener('load', schedule)
    cancelSchedule?.()
  }
}
