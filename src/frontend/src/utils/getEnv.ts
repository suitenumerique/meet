/**
 * Resolve a frontend env var: window.VITE_CONFIG (injected at container startup)
 * first, else import.meta.env (build-time). Lets one image be reconfigured at
 * deploy time via VITE_* env vars.
 */
export const getEnv = <K extends keyof ImportMetaEnv>(
  key: K
): ImportMetaEnv[K] | undefined => {
  if (typeof window !== 'undefined' && window.VITE_CONFIG?.[key]) {
    return window.VITE_CONFIG[key] as ImportMetaEnv[K]
  }
  return import.meta.env[key]
}
