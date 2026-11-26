import { defineKeyframes } from '@pandacss/dev'

export const keyframes = defineKeyframes({
  slide: {
    from: {
      transform: 'var(--origin)',
      opacity: 0,
    },
    to: {
      transform: 'translateY(0)',
      opacity: 1,
    },
  },
  fade: { from: { opacity: 0 }, to: { opacity: 1 } },
  pulse: {
    '0%': { boxShadow: '0 0 0 0 rgba(255, 255, 255, 0.7)' },
    '75%': { boxShadow: '0 0 0 30px rgba(255, 255, 255, 0)' },
    '100%': { boxShadow: '0 0 0 0 rgba(255, 255, 255, 0)' },
  },
  active_speaker: {
    '0%': { height: '25%' },
    '25%': { height: '45%' },
    '50%': { height: '20%' },
    '100%': { height: '55%' },
  },
  active_speaker_small: {
    '0%': { height: '20%' },
    '25%': { height: '25%' },
    '50%': { height: '18%' },
    '100%': { height: '25%' },
  },
  wave_hand: {
    '0%': { transform: 'rotate(0deg)' },
    '20%': { transform: 'rotate(-20deg)' },
    '80%': { transform: 'rotate(20deg)' },
    '100%': { transform: 'rotate(0)' },
  },
  pulse_background: {
    '0%': { opacity: '1' },
    '50%': { opacity: '0.65' },
    '100%': { opacity: '1' },
  },
  rotate: {
    '0%': {
      transform: 'rotate(0deg)',
    },
    '100%': {
      transform: 'rotate(360deg)',
    },
  },
  prixClipFix: {
    '0%': {
      clipPath: 'polygon(50% 50%, 0 0, 0 0, 0 0, 0 0, 0 0)',
    },
    '25%': {
      clipPath: 'polygon(50% 50%, 0 0, 100% 0, 100% 0, 100% 0, 100% 0)',
    },
    '50%': {
      clipPath:
        'polygon(50% 50%, 0 0, 100% 0, 100% 100%, 100% 100%, 100% 100%)',
    },
    '75%': {
      clipPath: 'polygon(50% 50%, 0 0, 100% 0, 100% 100%, 0 100%, 0 100%)',
    },
    '100%': {
      clipPath: 'polygon(50% 50%, 0 0, 100% 0, 100% 100%, 0 100%, 0 0)',
    },
  },
  overlayIn: {
    from: { opacity: 0 },
    to: { opacity: 0.6 },
  },
  chevron_flip_open: {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(180deg)' },
  },
  chevron_flip_close: {
    from: { transform: 'rotate(180deg)' },
    to: { transform: 'rotate(0deg)' },
  },
})
