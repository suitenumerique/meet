export const safeParseMetadata = (
  metadataStr: string | null | undefined
): Record<string, unknown> => {
  if (!metadataStr) {
    return {}
  }

  try {
    const parsed = JSON.parse(metadataStr)

    // Ensure the result is an object
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn('Metadata parsed to non-object value:', parsed)
      return {}
    }

    return parsed as Record<string, unknown>
  } catch (error) {
    console.error('Failed to parse metadata:', error)
    return {}
  }
}
