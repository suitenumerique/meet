/** Severity vocabulary shared by host UI surfaces (banner, CC-button decoration). */
export type Tone = 'info' | 'success' | 'warning' | 'danger'

/** Themed color per tone, using the host's semantic Panda tokens. */
export const toneColor: Record<Tone, string> = {
  info: 'primary.700',
  success: 'success.700',
  warning: 'warning',
  danger: 'danger.700',
}
