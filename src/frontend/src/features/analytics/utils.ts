import type { PostHog } from 'posthog-js'
import { getConfig } from '@/api/useConfig'

let posthog: PostHog | null = null
let sdkPromise: Promise<PostHog> | undefined

const loadSdk = () => {
  sdkPromise ??= import('posthog-js').then(
    (module) => {
      posthog = module.default
      return posthog
    },
    (error) => {
      sdkPromise = undefined
      throw error
    }
  )
  return sdkPromise
}

/**
 * The only way to the SDK. Resolves to null, without downloading it, on
 * instances which have no analytics configured: callers don't have to know.
 *
 * The answer comes from the config query rather than from a flag someone has
 * to set: it cannot be forgotten or go stale, and a call made while the
 * config is still loading waits for it instead of guessing.
 */
export const getPosthog = async (): Promise<PostHog | null> => {
  const { analytics } = await getConfig()
  return analytics?.id && analytics.host ? loadSdk() : null
}

/** Synchronous peek: null until the lazy chunk has resolved. */
export const peekPosthog = () => posthog
