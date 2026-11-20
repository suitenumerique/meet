import type { PostHog } from 'posthog-js'

let posthog: PostHog | null = null

export const getPosthog = async () => {
  if (!posthog) posthog = (await import('posthog-js')).default
  return posthog
}

/** Synchronous peek: null until the lazy chunk has resolved. */
export const peekPosthog = () => posthog
