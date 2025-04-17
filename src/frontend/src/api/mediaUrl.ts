export const mediaUrl = (path: string) => {
  const origin =
    import.meta.env.VITE_API_BASE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '')

  // Remove leading/trailing slashes from origin/path if it exists
  const sanitizedOrigin = origin.replace(/\/$/, '')
  const sanitizedPath = path.replace(/^\//, '')

  return `${sanitizedOrigin}/media/${sanitizedPath}`
}
