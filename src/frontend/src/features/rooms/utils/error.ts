export const asError = (value: unknown): Error => {
  if (value instanceof Error) return value
  if (value instanceof Event) {
    return new Error(
      `Unhandled event "${value.type}" from ${value.target?.constructor.name ?? 'unknown'}`
    )
  }
  return new Error(String(value))
}
