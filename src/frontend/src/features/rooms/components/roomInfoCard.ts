import { css } from '@/styled-system/css'

/**
 * Card listing how to reach a room: its link and its phone access. Shared by
 * the dialogs which invite to copy them.
 */
export const roomInfoCard = css({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  marginTop: '0.5rem',
  padding: '1rem',
  backgroundColor: '#EEF1F4',
  border: '1px solid',
  borderColor: 'border.semantic.neutral.tertiary',
  borderRadius: '4px',
})

/**
 * A button of the card once its content is copied. The green of the `success`
 * buttons is made for a white surface: it gets one step deeper here, to stand
 * out on the tint of the card.
 */
export const roomInfoCopied = css({
  backgroundColor: 'background.semantic.success.secondary!',
  color: 'content.semantic.success.primary!',
})
